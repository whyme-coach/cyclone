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
  const { projectId, extracted } = body
  if (!projectId || !extracted) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: member } = await admin.from('project_members').select('role').eq('project_id', projectId).eq('user_id', user.id).single()
  if (!member) {
    return NextResponse.json({ error: 'Not a project member' }, { status: 403 })
  }

  try {
    const fiscalYear = extracted.fiscal_year || new Date().getFullYear()

    // 1. Save business_plan_data
    await admin.from('business_plan_data').upsert({
      project_id: projectId, fiscal_year: fiscalYear,
      mission: extracted.mission || null, vision: extracted.vision || null,
      value_statement: extracted.value_statement || null,
      business_policies: extracted.business_policies || [],
      financial_plan: extracted.financial_plan || {},
      investment_plan: extracted.investment_plan || [],
      personnel_plan: extracted.personnel_plan || [],
      schedule: extracted.schedule || [],
      raw_extraction: extracted,
    }, { onConflict: 'project_id,fiscal_year' })

    // 2. Batch insert management_goals
    if (extracted.management_goals?.length > 0) {
      const goalRows = extracted.management_goals.map((g: { type?: string; title: string; description?: string; target_value?: string; target_unit?: string }, i: number) => ({
        project_id: projectId, type: g.type || 'quantitative',
        title: g.title, description: g.description || '',
        target_value: g.target_value || '', target_unit: g.target_unit || '', sort_order: i,
      }))
      await admin.from('management_goals').insert(goalRows)
    }

    // 3. Save strategies with nested measures (sequential for ID references)
    if (extracted.strategies?.length > 0) {
      for (const [i, s] of extracted.strategies.entries()) {
        const { data: stratData } = await admin.from('strategies').insert({
          project_id: projectId, title: s.title, description: s.description || '',
          strategy_type: s.strategy_type || 'business', sort_order: i,
        }).select('id').single()

        if (stratData && s.measures?.length > 0) {
          // Batch insert measures
          const measRows = s.measures.map((m: { title: string; description?: string }, j: number) => ({
            project_id: projectId, title: m.title, description: m.description || '', sort_order: j,
          }))
          const { data: measResults } = await admin.from('measures').insert(measRows).select('id')

          // Batch insert links
          if (measResults?.length > 0) {
            const linkRows = measResults.map((m: { id: string }) => ({
              strategy_id: stratData.id, measure_id: m.id, linked_by: 'ai',
            }))
            await admin.from('strategy_measure_links').insert(linkRows)
          }
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Save business plan error:', err)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
