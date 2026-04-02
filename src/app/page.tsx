'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { LoginForm } from '@/components/auth/LoginForm'
import { Spinner } from '@/components/ui/Spinner'
import { createClient } from '@/lib/supabase/client'
import Link from 'next/link'

export default function LoginPage() {
  const [processing, setProcessing] = useState(false)
  const router = useRouter()

  // Handle Supabase Auth redirect with access_token in URL fragment
  useEffect(() => {
    const hash = window.location.hash
    if (hash && hash.includes('access_token')) {
      setProcessing(true)
      const supabase = createClient()

      // Supabase client auto-detects the hash and sets the session
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      supabase.auth.getSession().then(({ data }: any) => {
        const session = data?.session
        if (session) {
          // Check if this is from an invitation
          const invitedProjectId = session.user?.user_metadata?.invited_project_id
          if (invitedProjectId) {
            window.location.href = `/auth/accept-invitation?project=${invitedProjectId}`
          } else {
            window.location.href = '/projects'
          }
        } else {
          // Session not set yet, wait for onAuthStateChange
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, session: any) => {
            if (event === 'SIGNED_IN' && session) {
              subscription.unsubscribe()
              const invitedProjectId = session.user?.user_metadata?.invited_project_id
              if (invitedProjectId) {
                window.location.href = `/auth/accept-invitation?project=${invitedProjectId}`
              } else {
                window.location.href = '/projects'
              }
            }
          })
          // Timeout fallback
          setTimeout(() => { setProcessing(false) }, 10000)
        }
      })
    }
  }, [router])

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
