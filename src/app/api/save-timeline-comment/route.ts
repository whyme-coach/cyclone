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
