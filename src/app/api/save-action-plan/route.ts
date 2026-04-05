import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const { projectId, departmentId, kpiId, title, fiscalYear, items, existingPlanId, woopSummary, aiAdvice } = body
  if (!projectId || !departmentId || !items) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    let planId = existingPlanId

    if (existingPlanId) {
      // Update: delete old items first, update woop_summary if provided
      const { error: delErr } = await admin.from('action_items').delete().eq('action_plan_id', existingPlanId)
      if (delErr) console.error('Delete items error:', delErr)
      const updateData: Record<string, unknown> = {}
      if (woopSummary) updateData.woop_summary = woopSummary
      if (aiAdvice) updateData.ai_advice = aiAdvice
      if (Object.keys(updateData).length > 0) {
        await admin.from('action_plans').update(updateData).eq('id', existingPlanId)
      }
    } else {
      // Create new plan
      const insertData: Record<string, unknown> = {
        project_id: projectId,
        department_id: departmentId,
        title: title || 'アクションプラン',
        fiscal_year: fiscalYear,
        status: 'active',
        created_by: user.id,
      }
      if (kpiId) insertData.kpi_id = kpiId
      if (woopSummary) insertData.woop_summary = woopSummary
      if (aiAdvice) insertData.ai_advice = aiAdvice

      const { data: planData, error: planError } = await admin.from('action_plans').insert(insertData).select('id').single()

      if (planError || !planData) {
        console.error('Create plan error:', planError)
        return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
      }
      planId = planData.id
    }

    // Insert action items
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      const { error: itemError } = await admin.from('action_items').insert({
        action_plan_id: planId,
        title: item.title,
        description: item.description || '',
        deliverable: item.deliverable || '',
        start_date: item.start_date,
        end_date: item.end_date,
        sort_order: i,
        status: 'not_started',
        progress_percent: 0,
      })
      if (itemError) {
        console.error('Insert item error:', itemError)
      }
    }

    return NextResponse.json({ success: true, planId })
  } catch (err) {
    console.error('Save action plan error:', err)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
