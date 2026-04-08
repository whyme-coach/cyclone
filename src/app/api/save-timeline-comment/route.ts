import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { postId, content } = body
  if (!postId || !content) {
    return NextResponse.json({ error: 'Missing data' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify membership via post → project_id
  const { data: post } = await admin.from('timeline_posts').select('project_id').eq('id', postId).single()
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  const { data: membership } = await admin.from('project_members').select('id').eq('project_id', post.project_id).eq('user_id', user.id).single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { data, error } = await admin.from('timeline_comments').insert({
      post_id: postId,
      user_id: user.id,
      content,
    }).select('id').single()

    if (error) {
      console.error('Save timeline comment error:', error)
      return NextResponse.json({ error: 'Save failed' }, { status: 500 })
    }

    return NextResponse.json({ success: true, commentId: data.id })
  } catch (err) {
    console.error('Timeline comment exception:', err)
    return NextResponse.json({ error: 'Save failed' }, { status: 500 })
  }
}
