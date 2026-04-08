import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { projectId, departmentId, reportMonth, content, aiAnalysis } = body
  if (!projectId || !reportMonth) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: membership } = await admin.from('project_members').select('id').eq('project_id', projectId).eq('user_id', user.id).single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    // Check if report already exists for this month
    const { data: existing } = await admin
      .from('monthly_reports')
      .select('id')
      .eq('project_id', projectId)
      .eq('department_id', departmentId)
      .eq('report_month', reportMonth)
      .maybeSingle()

    if (existing) {
      // Update existing
      const { data, error } = await admin.from('monthly_reports').update({
        content: content || null,
        ai_analysis: aiAnalysis || null,
        status: 'finalized',
        finalized_at: new Date().toISOString(),
        finalized_by: user.id,
      }).eq('id', existing.id).select('id').single()

      if (error) {
        console.error('Update monthly report error:', error)
        return NextResponse.json({ error: 'Save failed' }, { status: 500 })
      }
      return NextResponse.json({ success: true, reportId: data.id })
    }

    // Insert new
    const { data, error } = await admin.from('monthly_reports').insert({
      project_id: projectId,
      department_id: departmentId || null,
      report_month: reportMonth,
      content: content || null,
      ai_analysis: aiAnalysis || null,
      status: 'finalized',
      finalized_at: new Date().toISOString(),
      finalized_by: user.id,
    }).select('id').single()

    if (error) {
      console.error('Save monthly report error:', error)
      return NextResponse.json({ error: 'Save failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, reportId: data.id })
  } catch (err) {
    console.error('Monthly report exception:', err)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
