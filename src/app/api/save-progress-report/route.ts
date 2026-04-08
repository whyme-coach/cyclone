import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { projectId, actionItemId, report } = body
  if (!projectId || !actionItemId || !report) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: membership } = await admin.from('project_members').select('id').eq('project_id', projectId).eq('user_id', user.id).single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    // Build insert data - core fields from original schema
    const insertData: Record<string, unknown> = {
      project_id: projectId,
      action_item_id: actionItemId,
      reporter_user_id: user.id,
      status: report.status || 'on_track',
      activities_completed: report.activities_completed || null,
      reflections: report.reflections || null,
      next_actions: report.next_actions || null,
      submitted_at: new Date().toISOString(),
      is_draft: false,
    }
    // New fields from migration 013 - include if provided
    if (report.planned_actions) insertData.planned_actions = report.planned_actions
    if (report.challenges) insertData.challenges = report.challenges
    if (report.next_action_deadline) insertData.next_action_deadline = report.next_action_deadline

    const { data, error } = await admin.from('progress_reports').insert(insertData).select('id').single()

    if (error) {
      console.error('Save progress report error:', error)
      return NextResponse.json({ error: 'Save failed' }, { status: 500 })
    }

    // Update action item status if report says completed
    if (report.status === 'completed') {
      await admin.from('action_items').update({ status: 'completed', progress_percent: 100 }).eq('id', actionItemId)
    } else if (report.status === 'delayed') {
      await admin.from('action_items').update({ status: 'delayed' }).eq('id', actionItemId)
    } else if (report.status === 'on_track' || report.status === 'at_risk') {
      await admin.from('action_items').update({ status: 'in_progress' }).eq('id', actionItemId)
    }

    return NextResponse.json({ success: true, reportId: data.id })
  } catch (err) {
    console.error('Progress report exception:', err)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
