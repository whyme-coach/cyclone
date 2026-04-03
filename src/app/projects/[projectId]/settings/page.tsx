'use client'

import { useState, useEffect, useMemo } from 'react'
import { useProjectContext } from '../layout'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'

export default function ProjectSettingsPage() {
  const { project, company, role, member, departments, refreshProject } = useProjectContext()
  const { user, profile, updateProfile } = useAuth()
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])

  // Profile form
  const [fullName, setFullName] = useState('')
  const [jobTitle, setJobTitle] = useState('')
  const [phone, setPhone] = useState('')
  const [savingProfile, setSavingProfile] = useState(false)

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '')
      setJobTitle(profile.job_title || '')
      setPhone(profile.phone || '')
    }
  }, [profile])

  const companyName = company?.name || ''
  const departmentName = departments.find(d => d.id === member?.department_id)?.name || ''

  const handleSaveProfile = async () => {
    setSavingProfile(true)
    try {
      await updateProfile({ full_name: fullName, job_title: jobTitle, phone })
      toast('プロフィールを更新しました', 'success')
    } catch {
      toast('更新に失敗しました', 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  // Password change
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [savingPassword, setSavingPassword] = useState(false)

  const handleChangePassword = async () => {
    if (newPassword !== confirmPassword) {
      toast('新しいパスワードが一致しません', 'error')
      return
    }
    if (newPassword.length < 6) {
      toast('パスワードは6文字以上にしてください', 'error')
      return
    }
    setSavingPassword(true)
    try {
      // Verify current password by re-signing in
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user?.email || '',
        password: currentPassword,
      })
      if (signInError) {
        toast('現在のパスワードが正しくありません', 'error')
        setSavingPassword(false)
        return
      }
      // Update password
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
      if (updateError) {
        toast('パスワードの更新に失敗しました', 'error')
      } else {
        toast('パスワードを変更しました', 'success')
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
      }
    } catch {
      toast('パスワードの更新に失敗しました', 'error')
    } finally {
      setSavingPassword(false)
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
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-slate-900">設定</h2>

      {/* Profile Settings */}
      <Card>
        <CardTitle>プロフィール</CardTitle>
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="会社名" value={companyName} disabled />
            <Input label="部署名" value={departmentName} disabled />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="氏名"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
            />
            <Input
              label="役職"
              value={jobTitle}
              onChange={e => setJobTitle(e.target.value)}
              placeholder="例: 課長、マネージャー"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="メールアドレス" value={profile?.email || ''} disabled />
            <Input
              label="携帯電話番号"
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="例: 090-1234-5678"
            />
          </div>
          <div className="pt-2">
            <Button onClick={handleSaveProfile} loading={savingProfile} disabled={!fullName.trim()}>プロフィールを保存</Button>
          </div>
        </div>
      </Card>

      {/* Password Change */}
      <Card>
        <CardTitle>パスワード変更</CardTitle>
        <div className="mt-4 space-y-4 max-w-md">
          <Input
            label="現在のパスワード"
            type="password"
            value={currentPassword}
            onChange={e => setCurrentPassword(e.target.value)}
            autoComplete="current-password"
          />
          <Input
            label="新しいパスワード"
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            autoComplete="new-password"
            placeholder="6文字以上"
          />
          <Input
            label="新しいパスワード（確認）"
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
          />
          {newPassword && confirmPassword && newPassword !== confirmPassword && (
            <p className="text-xs text-red-500">パスワードが一致しません</p>
          )}
          <Button
            onClick={handleChangePassword}
            loading={savingPassword}
            disabled={!currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
          >
            パスワードを変更
          </Button>
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
