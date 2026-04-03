'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoginForm } from '@/components/auth/LoginForm'
import { Spinner } from '@/components/ui/Spinner'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

// Check hash synchronously before first render
function getInitialState(): { processing: boolean; authError: string | null } {
  if (typeof window === 'undefined') return { processing: false, authError: null }
  const hash = window.location.hash
  if (hash.includes('error=')) {
    const params = new URLSearchParams(hash.replace('#', ''))
    const errorCode = params.get('error_code') || ''
    const errorDesc = params.get('error_description') || ''
    const msg = (errorCode === 'otp_expired' || errorDesc.includes('expired'))
      ? '招待リンクの有効期限が切れています。管理者に再招待を依頼してください。'
      : `認証エラー: ${errorDesc.replace(/\+/g, ' ')}`
    window.history.replaceState(null, '', '/')
    return { processing: false, authError: msg }
  }
  if (hash.includes('access_token')) {
    return { processing: true, authError: null }
  }
  return { processing: false, authError: null }
}

export default function LoginPage() {
  const initial = getInitialState()
  const [processing, setProcessing] = useState(initial.processing)
  const [authError] = useState(initial.authError)
  const router = useRouter()

  useEffect(() => {
    if (!processing) return
    const supabase = createClient()

    // Supabase client detects hash fragment and sets session
    const handleAuth = async () => {
      // Wait a moment for Supabase to process the hash
      await new Promise(r => setTimeout(r, 500))

      const { data } = await supabase.auth.getSession() as { data: { session: { user: { user_metadata?: Record<string, string> } } } | null }
      const session = (data as { session?: { user: { user_metadata?: Record<string, string> } } })?.session

      if (session) {
        const invitedProjectId = session.user?.user_metadata?.invited_project_id
        if (invitedProjectId) {
          window.location.href = `/auth/accept-invitation?project=${invitedProjectId}`
        } else {
          window.location.href = '/projects'
        }
        return
      }

      // Fallback: listen for auth state change
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (_event: string, newSession: { user: { user_metadata?: Record<string, string> } } | null) => {
          if (newSession) {
            subscription.unsubscribe()
            const pid = newSession.user?.user_metadata?.invited_project_id
            if (pid) {
              window.location.href = `/auth/accept-invitation?project=${pid}`
            } else {
              window.location.href = '/projects'
            }
          }
        }
      )

      // Timeout
      setTimeout(() => setProcessing(false), 15000)
    }

    handleAuth()
  }, [processing])

  if (processing) {
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
