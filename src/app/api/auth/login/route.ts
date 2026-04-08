import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  let body
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid request' }, { status: 400 }) }
  const { email, password } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'メールアドレスとパスワードを入力してください' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const msg = error.message === 'Invalid login credentials'
      ? 'メールアドレスまたはパスワードが正しくありません'
      : error.message === 'Email not confirmed'
        ? 'メールアドレスが確認されていません'
        : error.message
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  if (!data.session) {
    return NextResponse.json({ error: 'ログインに失敗しました' }, { status: 401 })
  }

  return NextResponse.json({ success: true, userId: data.user?.id })
}
