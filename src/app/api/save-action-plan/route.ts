import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, departmentId, kpiId, title, fiscalYear, items, existingPlanId } = await req.json()
  if (!projectId || !departmentId || !kpiId || !items) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    let planId = existingPlanId

    if (existingPlanId) {
      // Update: delete old items first
      await admin.from('action_items').delete().eq('action_plan_id', existingPlanId)
    } else {
      // Create new plan
      const { data: planData, error: planError } = await admin.from('action_plans').insert({
        project_id: projectId,
        department_id: departmentId,
        kpi_id: kpiId,
        title: title || 'アクションプラン',
        fiscal_year: fiscalYear,
        status: 'active',
        created_by: user.id,
      }).select('id').single()

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
