import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { postId } = body
  if (!postId) return NextResponse.json({ error: 'Missing postId' }, { status: 400 })

  const admin = createAdminClient()

  // Verify membership via post → project_id
  const { data: postCheck } = await admin.from('timeline_posts').select('project_id').eq('id', postId).single()
  if (!postCheck) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  const { data: membership } = await admin.from('project_members').select('id').eq('project_id', postCheck.project_id).eq('user_id', user.id).single()
  if (!membership) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    // Get current post metadata
    const { data: post } = await admin.from('timeline_posts').select('metadata').eq('id', postId).single()
    const metadata = (post?.metadata || {}) as Record<string, unknown>
    const acks = (metadata.acks || []) as Array<{ user_id: string; name: string; at: string }>

    // Toggle: add if not present, remove if present
    const existing = acks.findIndex(a => a.user_id === user.id)
    if (existing >= 0) {
      acks.splice(existing, 1)
    } else {
      // Get user name
      const { data: profile } = await admin.from('user_profiles').select('full_name').eq('id', user.id).single()
      acks.push({ user_id: user.id, name: profile?.full_name || '', at: new Date().toISOString() })
    }

    await admin.from('timeline_posts').update({ metadata: { ...metadata, acks } }).eq('id', postId)

    return NextResponse.json({ success: true, acks })
  } catch (err) {
    console.error('Toggle ack error:', err)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
