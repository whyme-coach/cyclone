import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  // Require authentication
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })

  const admin = createAdminClient()

  // Verify user is a member of this project
  const { data: membership } = await admin.from('project_members').select('id').eq('project_id', projectId).eq('user_id', user.id).single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: project } = await admin
    .from('projects')
    .select('name, company:companies(name)')
    .eq('id', projectId)
    .single()

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const company = project.company as unknown as { name: string } | null

  return NextResponse.json({
    projectName: project.name,
    companyName: company?.name || '',
  })
}
