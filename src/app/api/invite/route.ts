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

  // Check if user has permission to invite
  const { data: member } = await supabase
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['consultant', 'company_admin'].includes(member.role)) {
    return NextResponse.json({ error: '招待権限がありません' }, { status: 403 })
  }

  // Create invitation record
  const { error: inviteError } = await supabase
    .from('invitations')
    .upsert({
      project_id: projectId,
      email,
      role,
      department_id: departmentId || null,
      invited_by: user.id,
      status: 'pending',
    }, { onConflict: 'project_id,email' })

  if (inviteError) {
    return NextResponse.json({ error: '招待の作成に失敗しました' }, { status: 500 })
  }

  // Send invitation email via Supabase Auth
  const admin = createAdminClient()
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  // Check if user already exists
  const { data: existingUsers } = await admin.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find(u => u.email === email)

  if (existingUser) {
    // User exists - just add as project member
    await supabase.from('project_members').upsert({
      project_id: projectId,
      user_id: existingUser.id,
      role,
      department_id: departmentId || null,
      invited_by: user.id,
    }, { onConflict: 'project_id,user_id' })

    await supabase.from('invitations').update({ status: 'accepted' })
      .eq('project_id', projectId)
      .eq('email', email)
  } else {
    // New user - send invite email
    await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/auth/accept-invitation?project=${projectId}`,
      data: { invited_project_id: projectId, invited_role: role },
    })
  }

  return NextResponse.json({ success: true })
}
