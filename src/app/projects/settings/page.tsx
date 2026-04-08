'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import type { UserProfile } from '@/types'

export default function OrganizationSettingsPage() {
  const { organization, loading: authLoading } = useAuth()
  const { toast } = useToast()

  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [website, setWebsite] = useState('')
  const [saving, setSaving] = useState(false)

  // Member management
  const supabase = useMemo(() => createClient(), [])
  const [members, setMembers] = useState<Array<{ id: string; user_id: string; role: string; profile?: UserProfile }>>([])
  const [membersLoading, setMembersLoading] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviting, setInviting] = useState(false)

  // Fetch org members
  useEffect(() => {
    if (!organization) return
    const fetchMembers = async () => {
      setMembersLoading(true)
      const { data: orgMembers } = await supabase.from('organization_members').select('*').eq('organization_id', organization.id)
      if (orgMembers && orgMembers.length > 0) {
        const userIds = orgMembers.map((m: { user_id: string }) => m.user_id)
        const { data: profiles } = await supabase.from('user_profiles').select('*').in('id', userIds)
        const profileMap = Object.fromEntries((profiles || []).map((p: UserProfile) => [p.id, p]))
        setMembers(orgMembers.map((m: { id: string; user_id: string; role: string }) => ({ ...m, profile: profileMap[m.user_id] })))
      }
      setMembersLoading(false)
    }
    fetchMembers()
  }, [organization, supabase])

  const handleInvite = async () => {
    if (!organization || !inviteEmail.trim()) return
    setInviting(true)
    try {
      const res = await fetch('/api/invite-consultant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: organization.id, email: inviteEmail.trim(), role: 'consultant' }),
      })
      if (!res.ok) throw new Error()
      toast('招待を送信しました', 'success')
      setInviteEmail('')
      // Refresh members
      const { data: orgMembers } = await supabase.from('organization_members').select('*').eq('organization_id', organization.id)
      if (orgMembers) {
        const userIds = orgMembers.map((m: { user_id: string }) => m.user_id)
        const { data: profiles } = await supabase.from('user_profiles').select('*').in('id', userIds)
        const profileMap = Object.fromEntries((profiles || []).map((p: UserProfile) => [p.id, p]))
        setMembers(orgMembers.map((m: { id: string; user_id: string; role: string }) => ({ ...m, profile: profileMap[m.user_id] })))
      }
    } catch {
      toast('招待の送信に失敗しました', 'error')
    } finally {
      setInviting(false)
    }
  }

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

      {/* Members */}
      <Card>
        <CardTitle>メンバー</CardTitle>
        <p className="text-xs text-slate-500 mt-1">コンサルティングファームのメンバーを管理します</p>

        {/* Invite form */}
        <div className="mt-4 flex gap-2">
          <Input
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            placeholder="メールアドレスを入力..."
            type="email"
            onKeyDown={e => { if (e.key === 'Enter') handleInvite() }}
          />
          <Button onClick={handleInvite} loading={inviting} disabled={!inviteEmail.trim()}>
            招待
          </Button>
        </div>

        {/* Member list */}
        <div className="mt-4">
          {membersLoading ? (
            <div className="flex justify-center py-4"><Spinner size="sm" /></div>
          ) : members.length === 0 ? (
            <p className="text-sm text-slate-400">メンバーがいません</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200">
                  <th className="text-left py-2 px-2 text-slate-500 font-semibold">氏名</th>
                  <th className="text-left py-2 px-2 text-slate-500 font-semibold">メール</th>
                  <th className="text-left py-2 px-2 text-slate-500 font-semibold">ロール</th>
                </tr>
              </thead>
              <tbody>
                {members.map(m => (
                  <tr key={m.id} className="border-b border-slate-100">
                    <td className="py-2 px-2 text-slate-800">{m.profile?.full_name || '-'}</td>
                    <td className="py-2 px-2 text-slate-600">{m.profile?.email || '-'}</td>
                    <td className="py-2 px-2">
                      <Badge variant={m.role === 'owner' ? 'info' : 'default'}>
                        {m.role === 'owner' ? 'オーナー' : 'コンサルタント'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  )
}
