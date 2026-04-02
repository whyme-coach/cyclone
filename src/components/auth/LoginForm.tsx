'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'

export function LoginForm() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const formData = new FormData(formRef.current!)
    const email = (formData.get('email') as string) || ''
    const password = (formData.get('password') as string) || ''

    if (!email || !password) {
      setError('メールアドレスとパスワードを入力してください')
      setLoading(false)
      return
    }

    try {
      // Call Supabase auth API directly to avoid gotrue-js lock issues
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

      const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseKey,
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok || !data.access_token) {
        const msg = data.error_description || data.msg || data.error || 'ログインに失敗しました'
        setError(
          msg === 'Invalid login credentials'
            ? 'メールアドレスまたはパスワードが正しくありません'
            : msg === 'Email not confirmed'
              ? 'メールアドレスが確認されていません'
              : msg
        )
        setLoading(false)
        return
      }

      // Set the session in Supabase client
      const supabase = createClient()
      await supabase.auth.setSession({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      })

      // Hard navigation to ensure middleware picks up the cookie
      window.location.href = '/projects'
    } catch (err) {
      setError('ネットワークエラーが発生しました。もう一度お試しください。')
      setLoading(false)
    }
  }

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
          メールアドレス<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="example@company.co.jp"
          required
          className="w-full px-4 py-2.5 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
          パスワード<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="パスワードを入力"
          required
          className="w-full px-4 py-2.5 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
        />
      </div>
      <Button type="submit" loading={loading} className="w-full">
        ログイン
      </Button>
    </form>
  )
}
