'use client'

import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

export default function SettingsPage() {
  const { profile, updateProfile } = useAuth()
  const { toast } = useToast()
  const [fullName, setFullName] = useState(profile?.full_name || '')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateProfile({ full_name: fullName })
      toast('プロフィールを更新しました', 'success')
    } catch {
      toast('更新に失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <h2 className="text-2xl font-bold text-slate-900 mb-6">設定</h2>
      <Card>
        <CardTitle>プロフィール</CardTitle>
        <div className="mt-4 space-y-4 max-w-md">
          <Input label="メールアドレス" value={profile?.email || ''} disabled />
          <Input
            label="氏名"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
          />
          <Button onClick={handleSave} loading={saving}>保存</Button>
        </div>
      </Card>
    </div>
  )
}
