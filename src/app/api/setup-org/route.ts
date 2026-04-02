import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Check if user already has an organization
  const { data: existingMember } = await supabase
    .from('organization_members')
    .select('id, organization_id')
    .eq('user_id', user.id)
    .single()

  if (existingMember) {
    // Already has an org, return it
    const { data: org } = await supabase
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

  const orgName = body.name || user.user_metadata?.full_name
    ? `${user.user_metadata?.full_name || user.email}の組織`
    : `${user.email}の組織`

  // Create organization
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name: orgName })
    .select()
    .single()

  if (orgError) {
    console.error('Org creation error:', orgError)
    return NextResponse.json({ error: '組織の作成に失敗しました' }, { status: 500 })
  }

  // Add user as owner
  const { error: memberError } = await supabase
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
