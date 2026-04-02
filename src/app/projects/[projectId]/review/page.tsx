'use client'

import { useState, useEffect } from 'react'
import { useProjectContext } from '../layout'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { callAI, getAITextResponse } from '@/lib/ai/helpers'
import { QUARTERLY_SUMMARY_SYSTEM_PROMPT } from '@/lib/ai/prompts/quarterly-summary'
import { formatDate } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import type { ReviewCycleRecord } from '@/types'

export default function ReviewPage() {
  const { project, role } = useProjectContext()
  const { user } = useAuth()
  const [cycles, setCycles] = useState<ReviewCycleRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()
  const canManage = role === 'consultant' || role === 'company_admin'

  useEffect(() => {
    if (!project) return
    const fetch = async () => {
      const { data } = await supabase
        .from('review_cycles')
        .select('*')
        .eq('project_id', project.id)
        .order('period_start')
      if (data) setCycles(data)
      setLoading(false)
    }
    fetch()
  }, [project, supabase])

  const handleCreateCycle = async (cycleType: string) => {
    if (!project) return
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const endMonth = cycleType === 'quarterly' ? 3 : cycleType === 'semi_annual' ? 6 : 12
    const end = new Date(start.getFullYear(), start.getMonth() + endMonth, 0)

    try {
      const { data } = await supabase.from('review_cycles').insert({
        project_id: project.id,
        cycle_type: cycleType,
        period_start: start.toISOString().split('T')[0],
        period_end: end.toISOString().split('T')[0],
        status: 'pending',
      }).select().single()
      if (data) setCycles(prev => [...prev, data])
      toast('レビューサイクルを作成しました', 'success')
    } catch {
      toast('作成に失敗しました', 'error')
    }
  }

  const handleStartReview = async (id: string) => {
    try {
      await supabase.from('review_cycles').update({ status: 'in_progress' }).eq('id', id)
      setCycles(prev => prev.map(c => c.id === id ? { ...c, status: 'in_progress' } as ReviewCycleRecord : c))
      toast('レビューを開始しました', 'success')
    } catch {
      toast('更新に失敗しました', 'error')
    }
  }

  const handleCompleteReview = async (id: string) => {
    try {
      await supabase.from('review_cycles').update({ status: 'completed' }).eq('id', id)
      setCycles(prev => prev.map(c => c.id === id ? { ...c, status: 'completed' } as ReviewCycleRecord : c))
      toast('レビューを完了しました', 'success')
    } catch {
      toast('更新に失敗しました', 'error')
    }
  }

  const handleCloseYear = async () => {
    if (!project || !user) return
    if (!confirm('年度をクローズすると、アクションプランの編集ができなくなります。よろしいですか？')) return
    try {
      await supabase.from('projects').update({
        status: 'closed',
        is_closed: true,
        closed_at: new Date().toISOString(),
        closed_by: user.id,
      }).eq('id', project.id)
      toast('年度をクローズしました', 'success')
      setShowCloseModal(false)
      window.location.reload()
    } catch {
      toast('クローズに失敗しました', 'error')
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  const cycleTypeLabels: Record<string, string> = { quarterly: '四半期', semi_annual: '半期', year_end: '年度末' }
  const statusLabels: Record<string, string> = { pending: '未開始', in_progress: '進行中', completed: '完了' }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">レビュー管理</h2>
        {canManage && !project?.is_closed && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => handleCreateCycle(project?.review_cycle || 'quarterly')}>
              {project?.review_cycle === 'semi_annual' ? '半期' : '四半期'}レビューを作成
            </Button>
            <Button variant="danger" onClick={() => setShowCloseModal(true)}>
              年度クローズ
            </Button>
          </div>
        )}
      </div>

      {project?.is_closed && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <p className="text-sm text-yellow-800 font-medium">この年度はクローズされています。アクションプランの編集はできません。</p>
          {project.closed_at && <p className="text-xs text-yellow-600 mt-1">クローズ日: {formatDate(project.closed_at)}</p>}
        </div>
      )}

      {cycles.length === 0 ? (
        <Card>
          <EmptyState
            title="レビューサイクルがありません"
            description={canManage ? 'レビューサイクルを作成して、定期的な振り返りを実施しましょう' : '管理者がレビューサイクルを作成するとここに表示されます'}
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {cycles.map(cycle => (
            <Card key={cycle.id}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={cycle.status === 'completed' ? 'success' : cycle.status === 'in_progress' ? 'info' : 'default'}>
                      {statusLabels[cycle.status]}
                    </Badge>
                    <span className="text-sm font-medium text-slate-900">{cycleTypeLabels[cycle.cycle_type]}レビュー</span>
                  </div>
                  <p className="text-xs text-slate-500">
                    期間: {formatDate(cycle.period_start)} 〜 {formatDate(cycle.period_end)}
                  </p>
                </div>
                {canManage && (
                  <div className="flex gap-2">
                    {cycle.status === 'pending' && (
                      <Button size="sm" onClick={() => handleStartReview(cycle.id)}>開始</Button>
                    )}
                    {cycle.status === 'in_progress' && (
                      <Button size="sm" onClick={() => handleCompleteReview(cycle.id)}>完了</Button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCloseModal && (
        <Modal open title="年度クローズ" onClose={() => setShowCloseModal(false)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              年度をクローズすると、全てのアクションプランが編集不可になります。この操作は取り消せません。
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-sm text-red-700 font-medium">注意事項:</p>
              <ul className="text-xs text-red-600 mt-1 list-disc list-inside space-y-1">
                <li>全アクションアイテムの編集・追加・削除ができなくなります</li>
                <li>進捗報告の新規作成ができなくなります</li>
                <li>新年度のアクションプランは別途作成する必要があります</li>
              </ul>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowCloseModal(false)}>キャンセル</Button>
              <Button variant="danger" onClick={handleCloseYear}>年度をクローズ</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
