'use client'

import { useState, useEffect } from 'react'
import { useProjectContext } from '../layout'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'

export default function ProjectSettingsPage() {
  const { project, role, refreshProject } = useProjectContext()
  const { profile, updateProfile } = useAuth()
  const { toast } = useToast()
  const supabase = createClient()

  // Profile form
  const [fullName, setFullName] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  useEffect(() => {
    if (profile?.full_name) setFullName(profile.full_name)
  }, [profile])

  const handleSaveProfile = async () => {
    setSavingProfile(true)
    try {
      await updateProfile({ full_name: fullName })
      toast('プロフィールを更新しました', 'success')
    } catch {
      toast('更新に失敗しました', 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  // Project settings form (consultant/admin only)
  const [savingProject, setSavingProject] = useState(false)
  const [frequency, setFrequency] = useState<string>(project?.reporting_frequency || 'monthly')
  const [reviewCycle, setReviewCycle] = useState<string>(project?.review_cycle || 'quarterly')
  const isAdmin = role === 'consultant' || role === 'company_admin'

  const handleSaveProject = async () => {
    if (!project) return
    setSavingProject(true)
    try {
      await supabase.from('projects').update({
        reporting_frequency: frequency,
        review_cycle: reviewCycle,
      }).eq('id', project.id)
      await refreshProject()
      toast('プロジェクト設定を保存しました', 'success')
    } catch {
      toast('保存に失敗しました', 'error')
    } finally {
      setSavingProject(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">設定</h2>

      {/* Profile Settings */}
      <Card>
        <CardTitle>プロフィール</CardTitle>
        <div className="mt-4 space-y-4 max-w-md">
          <Input label="メールアドレス" value={profile?.email || ''} disabled />
          <Input
            label="氏名"
            value={fullName}
            onChange={e => setFullName(e.target.value)}
          />
          <Button onClick={handleSaveProfile} loading={savingProfile} disabled={!fullName.trim()}>保存</Button>
        </div>
      </Card>

      {/* Project Settings (admin only) */}
      {isAdmin && (
        <Card>
          <CardTitle>プロジェクト設定</CardTitle>
          <p className="text-sm text-slate-500 mt-1">報告・レビューの設定</p>
          <div className="mt-4 space-y-4 max-w-md">
            <Select
              label="報告頻度"
              value={frequency}
              onChange={e => setFrequency(e.target.value)}
              options={[
                { value: 'weekly', label: '週次' },
                { value: 'monthly', label: '月次' },
              ]}
            />
            <Select
              label="レビューサイクル"
              value={reviewCycle}
              onChange={e => setReviewCycle(e.target.value)}
              options={[
                { value: 'quarterly', label: '四半期' },
                { value: 'semi_annual', label: '半期' },
              ]}
            />
            <Button onClick={handleSaveProject} loading={savingProject}>保存</Button>
          </div>
        </Card>
      )}
    </div>
  )
}
