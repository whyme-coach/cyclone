import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { kpiId, recordDate, value } = body
  if (!kpiId || !recordDate || value === undefined || value === null) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }

  const admin = createAdminClient()

  try {
    // Upsert: UNIQUE(kpi_id, record_date) allows overwriting same period
    const { error } = await admin.from('kpi_records').upsert({
      kpi_id: kpiId,
      record_date: recordDate,
      value: parseFloat(value),
      recorded_by: user.id,
    }, { onConflict: 'kpi_id,record_date' })

    if (error) {
      console.error('Save KPI record error:', error)
      return NextResponse.json({ error: 'Save failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('KPI record exception:', err)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
