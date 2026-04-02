import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  // Authenticate the user
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Use admin client to bypass RLS for org creation
  const admin = createAdminClient()

  // Check if user already has an organization
  const { data: existingMember } = await admin
    .from('organization_members')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single()

  if (existingMember) {
    const { data: org } = await admin
      .from('organizations')
      .select('*')
      .eq('id', existingMember.organization_id)
      .single()
    return NextResponse.json({ organization: org, existing: true })
  }

  // Parse request body for org name
  let body: { name?: string } = {}
  try {
    body = await req.json()
  } catch {
    // empty body is OK
  }

  const orgName = body.name || `${user.user_metadata?.full_name || user.email}の組織`

  // Create organization (admin bypasses RLS)
  const { data: org, error: orgError } = await admin
    .from('organizations')
    .insert({ name: orgName })
    .select()
    .single()

  if (orgError) {
    console.error('Org creation error:', orgError)
    return NextResponse.json({ error: '組織の作成に失敗しました' }, { status: 500 })
  }

  // Add user as owner (admin bypasses RLS)
  const { error: memberError } = await admin
    .from('organization_members')
    .insert({
      organization_id: org.id,
      user_id: user.id,
      role: 'owner',
    })

  if (memberError) {
    console.error('Member creation error:', memberError)
    return NextResponse.json({ error: 'メンバー登録に失敗しました' }, { status: 500 })
  }

  return NextResponse.json({ organization: org, existing: false })
}
