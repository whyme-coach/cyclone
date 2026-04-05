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

  try {
    const { data, error } = await admin.from('progress_reports').insert({
      project_id: projectId,
      action_item_id: actionItemId,
      reporter_user_id: user.id,
      status: report.status || 'on_track',
      planned_actions: report.planned_actions || null,
      activities_completed: report.activities_completed || null,
      reflections: report.reflections || null,
      challenges: report.challenges || null,
      next_actions: report.next_actions || null,
      next_action_deadline: report.next_action_deadline || null,
      submitted_at: new Date().toISOString(),
      is_draft: false,
    }).select('id').single()

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
