'use client'

export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import Link from 'next/link'

export default function RegisterPage() {
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [validationError, setValidationError] = useState('')
  const { signUp, error } = useAuth()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setValidationError('')

    if (password.length < 6) {
      setValidationError('パスワードは6文字以上で入力してください')
      return
    }
    if (password !== confirmPassword) {
      setValidationError('パスワードが一致しません')
      return
    }

    setLoading(true)
    try {
      await signUp(email, password, fullName)
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
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">確認メールを送信しました</h2>
            <p className="text-sm text-slate-600 mb-6">
              {email} に確認メールを送信しました。メール内のリンクをクリックして登録を完了してください。
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
          <p className="mt-2 text-sm text-slate-600">
            事業計画実行支援プラットフォーム
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8">
          <h2 className="text-lg font-semibold text-slate-900 mb-6">新規登録</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {(error || validationError) && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {validationError || error}
              </div>
            )}
            <Input
              label="氏名"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="山田 太郎"
              required
            />
            <Input
              label="メールアドレス"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="example@company.co.jp"
              required
            />
            <Input
              label="パスワード"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="6文字以上"
              required
            />
            <Input
              label="パスワード（確認）"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="パスワードを再入力"
              required
            />
            <Button type="submit" loading={loading} className="w-full">
              登録する
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-slate-500">
            アカウントをお持ちの方は{' '}
            <Link href="/" className="text-blue-600 hover:text-blue-700">
              ログイン
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
