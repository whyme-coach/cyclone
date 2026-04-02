'use client'

import { useState, useRef } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function LoginForm() {
  const [loading, setLoading] = useState(false)
  const { signIn, error } = useAuth()
  const formRef = useRef<HTMLFormElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Read values directly from form elements to handle browser autofill
    const formData = new FormData(formRef.current!)
    const email = (formData.get('email') as string) || ''
    const password = (formData.get('password') as string) || ''

    if (!email || !password) {
      setLoading(false)
      return
    }

    try {
      await signIn(email, password)
      // Use hard navigation to ensure middleware picks up the new session cookie
      window.location.href = '/projects'
    } catch {
      // error is set in useAuth
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
