'use client'

import { useState } from 'react'
import { useProjectContext } from '../layout'
import { Card, CardTitle } from '@/components/ui/Card'
import { Select } from '@/components/ui/Select'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'

export default function ProjectSettingsPage() {
  const { project, refreshProject } = useProjectContext()
  const { toast } = useToast()
  const supabase = createClient()
  const [saving, setSaving] = useState(false)
  const [frequency, setFrequency] = useState<string>(project?.reporting_frequency || 'monthly')
  const [reviewCycle, setReviewCycle] = useState<string>(project?.review_cycle || 'quarterly')

  const handleSave = async () => {
    if (!project) return
    setSaving(true)
    try {
      await supabase.from('projects').update({
        reporting_frequency: frequency,
        review_cycle: reviewCycle,
      }).eq('id', project.id)
      await refreshProject()
      toast('設定を保存しました', 'success')
    } catch {
      toast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">プロジェクト設定</h2>
      <Card>
        <CardTitle>報告・レビュー設定</CardTitle>
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
          <Button onClick={handleSave} loading={saving}>保存</Button>
        </div>
      </Card>
    </div>
  )
}
