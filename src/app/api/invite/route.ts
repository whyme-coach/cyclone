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

  // Use admin client to bypass RLS for invitation management
  const admin = createAdminClient()

  // Check if user has permission to invite (via admin to avoid RLS issues)
  const { data: member } = await admin
    .from('project_members')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .single()

  if (!member || !['consultant', 'company_admin'].includes(member.role)) {
    return NextResponse.json({ error: '招待権限がありません' }, { status: 403 })
  }

  // Create invitation record (admin bypasses RLS)
  const { error: inviteError } = await admin
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
    console.error('Invitation error:', inviteError)
    return NextResponse.json({ error: '招待の作成に失敗しました: ' + inviteError.message }, { status: 500 })
  }

  // Check if user already exists
  const { data: existingUsers } = await admin.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find(u => u.email === email)

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  if (existingUser) {
    // User exists - add as project member
    await admin.from('project_members').upsert({
      project_id: projectId,
      user_id: existingUser.id,
      role,
      department_id: departmentId || null,
      invited_by: user.id,
    }, { onConflict: 'project_id,user_id' })

    await admin.from('invitations').update({ status: 'accepted' })
      .eq('project_id', projectId)
      .eq('email', email)
  } else {
    // New user - send invite email
    try {
      await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${siteUrl}/auth/callback?next=/auth/accept-invitation?project=${projectId}`,
        data: { invited_project_id: projectId, invited_role: role },
      })
    } catch (emailErr) {
      console.error('Email invite error:', emailErr)
      // Invitation record is already saved, email send failure is non-fatal
    }
  }

  return NextResponse.json({ success: true })
}
