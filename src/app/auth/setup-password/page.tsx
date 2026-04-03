'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

export default function SetupPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>}>
      <SetupPasswordContent />
    </Suspense>
  )
}

function SetupPasswordContent() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    // Supabase client will auto-detect the hash fragment and set the session
    const checkSession = async () => {
      // Wait for Supabase to process the hash
      await new Promise(r => setTimeout(r, 1000))

      const { data } = await supabase.auth.getSession()
      const session = (data as Record<string, unknown>)?.session
      if (session) {
        setSessionReady(true)
      } else {
        setError('認証に失敗しました。招待リンクの有効期限が切れている可能性があります。')
      }
      setInitializing(false)
    }
    checkSession()
  }, [supabase])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password.length < 6) {
      setError('パスワードは6文字以上で入力してください')
      return
    }
    if (password !== confirmPassword) {
      setError('パスワードが一致しません')
      return
    }

    setLoading(true)
    setError(null)
    try {
      const { error: updateErr } = await supabase.auth.updateUser({ password })
      if (updateErr) {
        setError(updateErr.message)
        setLoading(false)
        return
      }

      // Get user metadata for project redirect
      const { data: { user } } = await supabase.auth.getUser()
      const invitedProjectId = user?.user_metadata?.invited_project_id

      if (invitedProjectId) {
        window.location.href = `/auth/accept-invitation?project=${invitedProjectId}`
      } else {
        window.location.href = '/projects'
      }
    } catch {
      setError('パスワードの設定に失敗しました')
      setLoading(false)
    }
  }

  if (initializing) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <Spinner size="lg" />
        <p className="text-sm text-slate-600">認証を処理しています...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Cyclone</h1>
          <p className="mt-2 text-sm text-slate-600">事業計画実行支援プラットフォーム</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
          {sessionReady ? (
            <>
              <h2 className="text-lg font-semibold text-slate-900 mb-2">パスワード設定</h2>
              <p className="text-sm text-slate-500 mb-6">アカウントのパスワードを設定してください</p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">パスワード<span className="text-red-500 ml-0.5">*</span></label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="6文字以上"
                    required
                    className="w-full px-4 py-2.5 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">パスワード（確認）<span className="text-red-500 ml-0.5">*</span></label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    placeholder="パスワードを再入力"
                    required
                    className="w-full px-4 py-2.5 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
                  />
                </div>
                <Button type="submit" loading={loading} className="w-full">
                  パスワードを設定して参加する
                </Button>
              </form>
            </>
          ) : (
            <div className="text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
              <p className="text-sm text-red-700 mb-4">{error}</p>
              <Button variant="secondary" onClick={() => router.push('/')}>ログインページへ</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
