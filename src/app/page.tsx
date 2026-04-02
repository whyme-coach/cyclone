'use client'

export const dynamic = 'force-dynamic'

import { LoginForm } from '@/components/auth/LoginForm'
import Link from 'next/link'

export default function LoginPage() {
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
