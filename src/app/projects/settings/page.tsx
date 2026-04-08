'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'

export default function OrganizationSettingsPage() {
  const { organization, loading: authLoading } = useAuth()
  const { toast } = useToast()

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (organization) {
      setName(organization.name || '')
      setAddress(organization.address || '')
      setPhone(organization.phone || '')
      setWebsite(organization.website || '')
    }
  }, [organization])

  const handleSave = async () => {
    if (!organization) return
    setSaving(true)
    try {
      const res = await fetch('/api/save-organization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          organizationId: organization.id,
          name,
          address,
          phone,
          website,
        }),
      })
      if (!res.ok) throw new Error()
      toast('会社情報を保存しました', 'success')
    } catch {
      toast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (authLoading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  if (!organization) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-slate-900">会社情報</h2>
        <Card>
          <p className="text-sm text-slate-500">組織情報にアクセスする権限がありません。</p>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-slate-900">会社情報</h2>

      <Card>
        <CardTitle>コンサルティングファーム情報</CardTitle>
        <div className="mt-4 space-y-4">
          <Input
            label="会社名"
            value={name}
            onChange={e => setName(e.target.value)}
            required
          />
          <Input
            label="住所"
            value={address}
            onChange={e => setAddress(e.target.value)}
            placeholder="例: 東京都千代田区..."
          />
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="電話番号"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="例: 03-1234-5678"
            />
            <Input
              label="ウェブサイト"
              type="url"
              value={website}
              onChange={e => setWebsite(e.target.value)}
              placeholder="例: https://example.com"
            />
          </div>
          <div className="pt-2">
            <Button onClick={handleSave} loading={saving} disabled={!name.trim()}>保存</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
