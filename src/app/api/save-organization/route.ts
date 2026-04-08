import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { organizationId, name, address, phone, website } = body
  if (!organizationId || !name) return NextResponse.json({ error: 'Missing data' }, { status: 400 })

  const admin = createAdminClient()

  // Verify user is a member of this organization
  const { data: membership } = await admin.from('organization_members').select('id, role').eq('organization_id', organizationId).eq('user_id', user.id).single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { error } = await admin.from('organizations').update({
      name,
      address: address || null,
      phone: phone || null,
      website: website || null,
    }).eq('id', organizationId)

    if (error) {
      console.error('Save organization error:', error)
      return NextResponse.json({ error: 'Save failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Organization save exception:', err)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
