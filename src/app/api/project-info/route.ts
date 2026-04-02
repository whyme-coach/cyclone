import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { PROJECT_ROLE_LABELS } from '@/types/roles'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const projectId = searchParams.get('projectId')
  if (!projectId) return NextResponse.json({ error: 'Missing projectId' }, { status: 400 })

  const admin = createAdminClient()

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
