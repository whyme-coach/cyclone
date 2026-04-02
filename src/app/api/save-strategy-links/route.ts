import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { projectId, links, measureDepts } = await req.json()
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })

  const admin = createAdminClient()

  try {
    // Get existing strategies for this project
    const { data: strategies } = await admin.from('strategies').select('id').eq('project_id', projectId)
    const stratIds = strategies?.map((s: { id: string }) => s.id) || []

    // Clear existing links for this project's strategies
    if (stratIds.length > 0) {
      await admin.from('strategy_measure_links').delete().in('strategy_id', stratIds)
    }

    // Insert new links
    if (links && Array.isArray(links)) {
      for (const link of links) {
        if (link.strategy_id && link.measure_id) {
          await admin.from('strategy_measure_links').insert({
            strategy_id: link.strategy_id,
            measure_id: link.measure_id,
            linked_by: 'ai',
          })
        }
      }
    }

    // Update measure department assignments
    if (measureDepts && typeof measureDepts === 'object') {
      for (const [measureId, deptIds] of Object.entries(measureDepts)) {
        const primaryDeptId = (deptIds as string[])[0] || null
        await admin.from('measures').update({ department_id: primaryDeptId }).eq('id', measureId)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Save strategy links error:', err)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
