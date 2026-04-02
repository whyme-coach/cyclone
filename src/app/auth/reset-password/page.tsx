'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Link from 'next/link'

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const { resetPassword, error } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await resetPassword(email)
      setSuccess(true)
    } catch {
      // error is set in useAuth
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">メールを送信しました</h2>
            <p className="text-sm text-slate-600 mb-6">
              {email} にパスワードリセット用のリンクを送信しました。
            </p>
            <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm">
              ログインページに戻る
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900">Cyclone</h1>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-2">パスワードリセット</h2>
          <p className="text-sm text-slate-600 mb-6">
            登録済みのメールアドレスを入力してください。パスワードリセット用のリンクを送信します。
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {error}
              </div>
            )}
            <Input
              label="メールアドレス"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@company.co.jp"
              required
            />
            <Button type="submit" loading={loading} className="w-full">
              リセットリンクを送信
            </Button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/" className="text-sm text-blue-600 hover:text-blue-700">
              ログインに戻る
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
