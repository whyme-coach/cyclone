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
  const { projectId, email, role, departmentId, fullName, jobTitle } = body

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
  const redirectTo = `${siteUrl}/auth/callback?next=/auth/accept-invitation?project=${projectId}`

  // Check if user already has a profile (= confirmed active user)
  const { data: existingProfile } = await admin
    .from('user_profiles')
    .select('id')
    .eq('email', email)
    .single()

  if (existingProfile) {
    // Active user - add to project directly
    await admin.from('project_members').upsert({
      project_id: projectId,
      user_id: existingProfile.id,
      role,
      department_id: departmentId || null,
      invited_by: user.id,
    }, { onConflict: 'project_id,user_id' })

    // Update profile with name/job_title if provided and not already set
    const profileUpdates: Record<string, string> = {}
    if (fullName) profileUpdates.full_name = fullName
    if (jobTitle) profileUpdates.job_title = jobTitle
    if (Object.keys(profileUpdates).length > 0) {
      await admin.from('user_profiles').update(profileUpdates).eq('id', existingProfile.id)
    }

    await admin.from('invitations').update({ status: 'accepted' })
      .eq('project_id', projectId).eq('email', email)

    return NextResponse.json({ success: true, alreadyActive: true })
  }

  // Try invite (new user)
  try {
    const { error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        invited_project_id: projectId,
        invited_role: role,
        full_name: fullName || '',
        job_title: jobTitle || '',
      },
    })

    if (inviteErr) {
      // If already registered (unconfirmed), send magic link instead
      if (inviteErr.message?.includes('already') || inviteErr.status === 422) {
        // Use Supabase client signInWithOtp to send a magic link email
        const { error: otpErr } = await admin.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: redirectTo },
        })
        if (otpErr) {
          console.error('OTP error:', otpErr.message)
          return NextResponse.json({ success: true, emailSent: false, reason: otpErr.message })
        }
        return NextResponse.json({ success: true, emailSent: true, method: 'magiclink' })
      }
      console.error('Invite error:', inviteErr.message)
      return NextResponse.json({ success: true, emailSent: false, reason: inviteErr.message })
    }

    return NextResponse.json({ success: true, emailSent: true, method: 'invite' })
  } catch (err) {
    console.error('Invite exception:', err)
    return NextResponse.json({ success: true, emailSent: false })
  }
}
