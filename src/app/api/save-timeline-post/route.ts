import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { projectId, departmentId, postType, title, content, metadata, referenceId } = body
  if (!projectId || !postType || !title) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: membership } = await admin.from('project_members').select('id').eq('project_id', projectId).eq('user_id', user.id).single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { data, error } = await admin.from('timeline_posts').insert({
      project_id: projectId,
      department_id: departmentId || null,
      user_id: user.id,
      post_type: postType,
      title,
      content: content || null,
      metadata: metadata || null,
      reference_id: referenceId || null,
    }).select('id').single()

    if (error) {
      console.error('Save timeline post error:', error)
      return NextResponse.json({ error: 'Save failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, postId: data.id })
  } catch (err) {
    console.error('Timeline post exception:', err)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
