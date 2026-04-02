'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, error } = useAuth()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
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
      <Input
        label="パスワード"
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="パスワードを入力"
        required
      />
      <Button type="submit" loading={loading} className="w-full">
        ログイン
      </Button>
    </form>
  )
}
