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

  const { projectId, departmentId, profile } = body
  if (!projectId || !departmentId || !profile) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: membership } = await admin.from('project_members').select('id').eq('project_id', projectId).eq('user_id', user.id).single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { error } = await admin.from('department_profiles').upsert({
      project_id: projectId,
      department_id: departmentId,
      description: profile.description || null,
      strengths: profile.strengths || null,
      challenges: profile.challenges || null,
      technologies: profile.technologies || null,
      previous_year_summary: profile.previous_year_summary || null,
      previous_year_initiatives: profile.previous_year_initiatives || null,
      headcount: profile.headcount || null,
      next_year_focus: profile.next_year_focus || null,
      raw_extraction: profile.raw_extraction || null,
    }, { onConflict: 'project_id,department_id' })

    if (error) {
      console.error('Save dept profile error:', error)
      return NextResponse.json({ error: 'Save failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Save dept profile exception:', err)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
