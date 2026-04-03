import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId, departmentId, kpis } = await req.json()
  if (!projectId || !departmentId || !kpis) return NextResponse.json({ error: 'Missing data' }, { status: 400 })

  const admin = createAdminClient()

  try {
    for (const kpi of kpis) {
      const { data: kpiData } = await admin.from('kpis').insert({
        project_id: projectId,
        department_id: departmentId,
        name: kpi.name,
        description: `${kpi.description}\n\n【算出方法】${kpi.calculation}`,
        target_unit: kpi.unit,
        frequency: kpi.frequency || 'monthly',
        ...(kpi.previous_year_max != null ? { previous_year_max: kpi.previous_year_max } : {}),
      }).select('id').single()

      if (kpiData && kpi.measure_ids && Array.isArray(kpi.measure_ids)) {
        const linkRows = kpi.measure_ids
          .filter((id: string) => id)
          .map((measureId: string) => ({ kpi_id: kpiData.id, measure_id: measureId }))
        if (linkRows.length > 0) {
          await admin.from('kpi_measure_links').insert(linkRows)
        }
      }
    }
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Save KPI tree error:', err)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
