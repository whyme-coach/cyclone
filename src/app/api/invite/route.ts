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
    return NextResponse.json({ error: '招待の作成に失敗しました' }, { status: 500 })
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'

  // Check if user already exists in auth.users
  const { data: existingUsers } = await admin.auth.admin.listUsers()
  const existingUser = existingUsers?.users?.find(u => u.email === email)

  if (existingUser) {
    // Check if user has confirmed (has last_sign_in_at = active user)
    if (existingUser.last_sign_in_at) {
      // Active user - add as project member directly
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

      return NextResponse.json({ success: true, alreadyActive: true })
    } else {
      // User exists but never signed in - delete and re-invite
      try {
        await admin.auth.admin.deleteUser(existingUser.id)
      } catch (delErr) {
        console.error('Delete user error:', delErr)
      }
      // Fall through to new user invite below
    }
  }

  // New user (or re-invite after delete) - send invite email
  try {
    const { error: emailErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/auth/accept-invitation?project=${projectId}`,
      data: { invited_project_id: projectId, invited_role: role },
    })
    if (emailErr) {
      console.error('Email invite error:', emailErr)
      return NextResponse.json({ success: true, emailSent: false, reason: emailErr.message })
    }
  } catch (emailErr) {
    console.error('Email invite exception:', emailErr)
    return NextResponse.json({ success: true, emailSent: false })
  }

  return NextResponse.json({ success: true, emailSent: true })
}
