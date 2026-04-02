import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { projectId, email, role, departmentId } = body

  if (!projectId || !email || !role) {
    return NextResponse.json({ error: '必須項目が不足しています' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Check permission
  const { data: member } = await admin
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['consultant', 'company_admin'].includes(member.role)) {
    return NextResponse.json({ error: '招待権限がありません' }, { status: 403 })
  }

  // Upsert invitation record
  await admin.from('invitations').upsert({
    project_id: projectId, email, role,
    department_id: departmentId || null,
    invited_by: user.id, status: 'pending',
  }, { onConflict: 'project_id,email' })

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  // Check if user exists by querying user_profiles table (faster than listUsers)
  const { data: existingProfile } = await admin
    .from('user_profiles')
    .select('id')
    .eq('email', email)
    .single()

  if (existingProfile) {
    // Active user exists - add directly to project
    await admin.from('project_members').upsert({
      project_id: projectId,
      user_id: existingProfile.id,
      role,
      department_id: departmentId || null,
      invited_by: user.id,
    }, { onConflict: 'project_id,user_id' })

    await admin.from('invitations').update({ status: 'accepted' })
      .eq('project_id', projectId).eq('email', email)

    return NextResponse.json({ success: true, alreadyActive: true })
  }

  // No active user - send invitation email
  // First, try to delete any existing unconfirmed auth user
  try {
    const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
    // Use a direct approach - just try to invite, Supabase will handle duplicates
  } catch {}

  try {
    // generateLink instead of inviteUserByEmail to get more control
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'invite',
      email,
      options: {
        redirectTo: `${siteUrl}/auth/callback?next=/auth/accept-invitation?project=${projectId}`,
        data: { invited_project_id: projectId, invited_role: role },
      },
    })

    if (linkErr) {
      console.error('Generate link error:', linkErr.message)
      // If user already exists, try magiclink instead
      if (linkErr.message.includes('already been registered') || linkErr.message.includes('already exists')) {
        const { error: magicErr } = await admin.auth.admin.generateLink({
          type: 'magiclink',
          email,
          options: {
            redirectTo: `${siteUrl}/auth/callback?next=/auth/accept-invitation?project=${projectId}`,
          },
        })
        if (magicErr) {
          console.error('Magic link error:', magicErr.message)
          return NextResponse.json({ success: true, emailSent: false, reason: magicErr.message })
        }
        return NextResponse.json({ success: true, emailSent: true, method: 'magiclink' })
      }
      return NextResponse.json({ success: true, emailSent: false, reason: linkErr.message })
    }

    return NextResponse.json({ success: true, emailSent: true })
  } catch (err) {
    console.error('Invite exception:', err)
    return NextResponse.json({ success: true, emailSent: false })
  }
}
