import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { organizationId, email, role } = body
  if (!organizationId || !email) return NextResponse.json({ error: 'Missing data' }, { status: 400 })

  const admin = createAdminClient()

  // Verify user is an org member
  const { data: membership } = await admin.from('organization_members').select('id, role').eq('organization_id', organizationId).eq('user_id', user.id).single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const memberRole = role || 'consultant'
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  try {
    // Check if user already exists
    const { data: existingProfile } = await admin.from('user_profiles').select('id').eq('email', email).single()

    if (existingProfile) {
      // Already has account - add to org directly
      const { error: insertErr } = await admin.from('organization_members').upsert({
        organization_id: organizationId,
        user_id: existingProfile.id,
        role: memberRole,
      }, { onConflict: 'organization_id,user_id' })
      if (insertErr) {
        console.error('Add org member error:', insertErr)
        return NextResponse.json({ error: 'Failed to add member' }, { status: 500 })
      }
      return NextResponse.json({ success: true, method: 'direct' })
    }

    // New user - send invitation
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/projects`,
      data: { full_name: '', org_id: organizationId, org_role: memberRole },
    })

    if (inviteErr) {
      if (inviteErr.message?.includes('already') || inviteErr.status === 422) {
        // Try magic link
        await admin.auth.signInWithOtp({ email, options: { emailRedirectTo: `${siteUrl}/auth/callback?next=/projects` } })
        return NextResponse.json({ success: true, method: 'magiclink' })
      }
      console.error('Invite error:', inviteErr)
      return NextResponse.json({ error: inviteErr.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, method: 'invite' })
  } catch (err) {
    console.error('Invite consultant exception:', err)
    return NextResponse.json({ error: 'Invitation failed' }, { status: 500 })
  }
}
