'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { LoginForm } from '@/components/auth/LoginForm'
import { Spinner } from '@/components/ui/Spinner'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  const [mode, setMode] = useState<'loading' | 'login' | 'processing' | 'error'>('loading')
  const [authError, setAuthError] = useState<string | null>(null)
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return
    processed.current = true

    const hash = window.location.hash

    // Check for error in fragment
    if (hash.includes('error=')) {
      const params = new URLSearchParams(hash.replace('#', ''))
      const errorCode = params.get('error_code') || ''
      const errorDesc = params.get('error_description') || ''
      const msg = (errorCode === 'otp_expired' || errorDesc.includes('expired'))
        ? '招待リンクの有効期限が切れています。管理者に再招待を依頼してください。'
        : `認証エラー: ${errorDesc.replace(/\+/g, ' ')}`
      setAuthError(msg)
      setMode('error')
      window.history.replaceState(null, '', '/')
      return
    }

    // Check for access_token in fragment
    if (hash.includes('access_token')) {
      setMode('processing')
      const supabase = createClient()

      // Give Supabase client time to detect and process the hash
      setTimeout(async () => {
        try {
          // getSession should now have the session from the hash
          const { data: sessionData } = await supabase.auth.getSession()
          const session = (sessionData as Record<string, unknown>)?.session as { user: { user_metadata?: Record<string, string> } } | null

          if (session) {
            const invitedProjectId = session.user?.user_metadata?.invited_project_id
            if (invitedProjectId) {
              window.location.href = `/auth/accept-invitation?project=${invitedProjectId}`
            } else {
              window.location.href = '/projects'
            }
            return
          }
        } catch (e) {
          console.error('Auth processing error:', e)
        }

        // Fallback: just redirect to projects (session may be set via cookie)
        window.location.href = '/projects'
      }, 1500)
      return
    }

    // No hash - show login form
    setMode('login')
  }, [])

  if (mode === 'loading' || mode === 'processing') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 gap-4">
        <Spinner size="lg" />
        <p className="text-sm text-slate-600">
          {mode === 'processing' ? '認証を処理しています...' : '読み込み中...'}
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Cyclone</h1>
          <p className="mt-2 text-sm text-slate-600">
            事業計画実行支援プラットフォーム
          </p>
        </div>

        {authError && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-center">
            <p className="text-sm text-red-700">{authError}</p>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">ログイン</h2>
          <LoginForm />
          <div className="mt-6 space-y-3 text-center text-sm">
            <div>
              <Link href="/auth/reset-password" className="text-blue-600 hover:text-blue-700">
                パスワードをお忘れの方
              </Link>
            </div>
            <div className="text-slate-500">
              アカウントをお持ちでない方は{' '}
              <Link href="/auth/register" className="text-blue-600 hover:text-blue-700">
                新規登録
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
