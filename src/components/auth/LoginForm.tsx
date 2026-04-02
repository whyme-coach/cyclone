'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'

export function LoginForm() {
  const [loading, setLoading] = useState(false)
  const { signIn, error } = useAuth()
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Read from DOM to handle browser autofill
    const formData = new FormData(formRef.current!)
    const email = (formData.get('email') as string) || ''
    const password = (formData.get('password') as string) || ''

    if (!email || !password) return

    setLoading(true)
    try {
      await signIn(email, password)
      router.push('/projects')
    } catch {
      // error is set in useAuth
    } finally {
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
        <label className="block text-sm font-medium text-slate-700 mb-1">
          メールアドレス<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
          name="email"
          type="email"
          autoComplete="email"
          placeholder="example@company.co.jp"
          required
          className="w-full px-4 py-2.5 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          パスワード<span className="text-red-500 ml-0.5">*</span>
        </label>
        <input
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
