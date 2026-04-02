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

    // Clear existing links in one call
    if (stratIds.length > 0) {
      await admin.from('strategy_measure_links').delete().in('strategy_id', stratIds)
    }

    // Batch insert all links at once
    if (links && Array.isArray(links) && links.length > 0) {
      const rows = links
        .filter((l: { strategy_id?: string; measure_id?: string }) => l.strategy_id && l.measure_id)
        .map((l: { strategy_id: string; measure_id: string }) => ({
          strategy_id: l.strategy_id,
          measure_id: l.measure_id,
          linked_by: 'ai',
        }))
      if (rows.length > 0) {
        await admin.from('strategy_measure_links').insert(rows)
      }
    }

    // Batch update measure departments
    if (measureDepts && typeof measureDepts === 'object') {
      const updates = Object.entries(measureDepts).map(([measureId, deptIds]) =>
        admin.from('measures').update({ department_id: (deptIds as string[])[0] || null }).eq('id', measureId)
      )
      await Promise.all(updates)
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Save strategy links error:', err)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
