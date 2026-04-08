import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId } = await req.json()
  if (!projectId) {
    return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Check if already a member
  const { data: existingMember } = await admin
    .from('project_members')
    .select('id')
    .eq('project_id', projectId)
    .eq('user_id', user.id)
    .single()

  if (existingMember) {
    return NextResponse.json({ success: true, message: 'already_member' })
  }

  // Find pending invitation by email
  const { data: invitation } = await admin
    .from('invitations')
    .select('*')
    .eq('project_id', projectId)
    .eq('email', user.email)
    .in('status', ['pending', 'sent'])
    .single()

  if (!invitation) {
    // No invitation found - reject to prevent role escalation via user_metadata
    return NextResponse.json({ error: 'No valid invitation found' }, { status: 403 })
  }

  // Add as project member
  const { error: memberErr } = await admin.from('project_members').insert({
    project_id: projectId,
    user_id: user.id,
    role: invitation.role,
    department_id: invitation.department_id,
    invited_by: invitation.invited_by,
  })

  if (memberErr) {
    console.error('Member insert error:', memberErr)
    return NextResponse.json({ error: 'Failed to join project' }, { status: 500 })
  }

  // Update invitation status
  await admin.from('invitations').update({ status: 'accepted' }).eq('id', invitation.id)

  return NextResponse.json({ success: true, message: 'accepted' })
}
