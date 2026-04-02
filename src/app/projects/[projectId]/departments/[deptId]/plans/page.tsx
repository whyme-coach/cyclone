'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useProjectContext } from '../../../layout'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { callAI, parseAIJsonResponse } from '@/lib/ai/helpers'
import { SUGGEST_ACTION_ITEMS_SYSTEM_PROMPT, SUGGEST_ACTION_ITEMS_USER_PROMPT } from '@/lib/ai/prompts/suggest-action-items'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { ACTION_ITEM_STATUS_LABELS } from '@/types/roles'
import type { ActionPlan, ActionItem, ActionItemStatus } from '@/types'

export default function ActionPlansPage() {
  const params = useParams()
  const deptId = params.deptId as string
  const { project, departments } = useProjectContext()
  const [plans, setPlans] = useState<(ActionPlan & { action_items: ActionItem[] })[]>([])
  const [loading, setLoading] = useState(true)
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [showItemModal, setShowItemModal] = useState(false)
  const [editingItem, setEditingItem] = useState<ActionItem | null>(null)
  const [activePlanId, setActivePlanId] = useState<string | null>(null)
  const { toast } = useToast()
  const supabase = createClient()
  const department = departments.find(d => d.id === deptId)

  useEffect(() => {
    if (!project) return
    const fetchPlans = async () => {
      const { data: planData } = await supabase
        .from('action_plans')
        .select('*, action_items(*)')
        .eq('project_id', project.id)
        .eq('department_id', deptId)
        .order('created_at')
      if (planData) setPlans(planData as (ActionPlan & { action_items: ActionItem[] })[])
      setLoading(false)
    }
    fetchPlans()
  }, [project, deptId, supabase])

  const handleCreatePlan = async (title: string) => {
    if (!project) return
    try {
      const { data } = await supabase.from('action_plans').insert({
        project_id: project.id,
        department_id: deptId,
        title,
        fiscal_year: project.fiscal_year,
        status: 'draft',
      }).select('*, action_items(*)').single()
      if (data) {
        setPlans(prev => [...prev, { ...data, action_items: [] }])
        setActivePlanId(data.id)
      }
      toast('アクションプランを作成しました', 'success')
      setShowPlanModal(false)
    } catch {
      toast('作成に失敗しました', 'error')
    }
  }

  const handleSaveItem = async (form: Partial<ActionItem>) => {
    if (!activePlanId) return
    try {
      if (editingItem) {
        await supabase.from('action_items').update(form).eq('id', editingItem.id)
        setPlans(prev => prev.map(p => ({
          ...p,
          action_items: p.action_items.map(ai => ai.id === editingItem.id ? { ...ai, ...form } as ActionItem : ai),
        })))
      } else {
        const { data } = await supabase.from('action_items').insert({
          ...form,
          action_plan_id: activePlanId,
          sort_order: (plans.find(p => p.id === activePlanId)?.action_items.length || 0),
        }).select().single()
        if (data) {
          setPlans(prev => prev.map(p => p.id === activePlanId ? { ...p, action_items: [...p.action_items, data] } : p))
        }
      }
      toast('保存しました', 'success')
      setShowItemModal(false)
      setEditingItem(null)
    } catch {
      toast('保存に失敗しました', 'error')
    }
  }

  const handleUpdateStatus = async (itemId: string, status: ActionItemStatus, progress: number) => {
    try {
      await supabase.from('action_items').update({ status, progress_percent: progress }).eq('id', itemId)
      setPlans(prev => prev.map(p => ({
        ...p,
        action_items: p.action_items.map(ai => ai.id === itemId ? { ...ai, status, progress_percent: progress } : ai),
      })))
    } catch {
      toast('更新に失敗しました', 'error')
    }
  }

  const [suggesting, setSuggesting] = useState(false)

  const handleSuggestItems = async () => {
    if (!project || !activePlanId) return
    setSuggesting(true)
    try {
      // Get measures for this department
      const { data: measures } = await supabase.from('measures').select('title').eq('department_id', deptId).limit(5)
      const { data: kpis } = await supabase.from('kpis').select('name, target_value, target_unit').eq('department_id', deptId).limit(5)
      const measStr = measures?.map((m: { title: string }) => m.title).join(', ') || ''
      const kpiStr = kpis?.map((k: { name: string; target_value?: number; target_unit?: string }) => `${k.name}(${k.target_value || ''}${k.target_unit || ''})`).join(', ') || ''
      const aiData = await callAI('suggest-action-items', {
        system: SUGGEST_ACTION_ITEMS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: SUGGEST_ACTION_ITEMS_USER_PROMPT(measStr, kpiStr, department?.name || '', project.fiscal_year, 3) }],
      })
      const result = parseAIJsonResponse(aiData) as { action_items?: Array<{ title: string; description?: string; start_month: number; end_month: number; deliverable?: string }> } | null
      if (result?.action_items) {
        for (const item of result.action_items) {
          const startDate = `${project.fiscal_year}-${String(item.start_month).padStart(2, '0')}-01`
          const endDate = new Date(project.fiscal_year, item.end_month, 0).toISOString().split('T')[0]
          const { data } = await supabase.from('action_items').insert({
            action_plan_id: activePlanId, title: item.title, description: item.description || '',
            start_date: startDate, end_date: endDate, deliverable: item.deliverable || '',
            sort_order: (plans.find(p => p.id === activePlanId)?.action_items.length || 0),
          }).select().single()
          if (data) {
            setPlans(prev => prev.map(p => p.id === activePlanId ? { ...p, action_items: [...p.action_items, data] } : p))
          }
        }
        toast(`${result.action_items.length}件のアクションを追加しました`, 'success')
      }
    } catch { toast('AI提案に失敗しました', 'error') }
    finally { setSuggesting(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  const activePlan = plans.find(p => p.id === activePlanId) || plans[0]

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">アクションプラン</h2>
          <p className="text-sm text-slate-500 mt-1">{department?.name}</p>
        </div>
        <Button onClick={() => setShowPlanModal(true)}>プランを追加</Button>
      </div>

      {plans.length === 0 ? (
        <Card>
          <EmptyState
            title="アクションプランがまだありません"
            description="施策をブレイクダウンして月次のアクションプランを作成しましょう"
            action={<Button onClick={() => setShowPlanModal(true)}>プランを作成</Button>}
          />
        </Card>
      ) : (
        <>
          {/* Plan tabs */}
          {plans.length > 1 && (
            <div className="flex gap-2 border-b border-slate-200 pb-2">
              {plans.map(p => (
                <button
                  key={p.id}
                  onClick={() => setActivePlanId(p.id)}
                  className={cn(
                    'px-3 py-1.5 text-sm rounded-lg',
                    (activePlan?.id === p.id) ? 'bg-blue-100 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
                  )}
                >
                  {p.title}
                </button>
              ))}
            </div>
          )}

          {activePlan && (
            <>
              {/* Gantt Chart */}
              <Card padding={false}>
                <div className="p-4 border-b border-slate-200 flex items-center justify-between">
                  <CardTitle>{activePlan.title}</CardTitle>
                  <div className="flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => { setActivePlanId(activePlan.id); handleSuggestItems() }} loading={suggesting}>
                      AI提案
                    </Button>
                    <Button size="sm" onClick={() => { setActivePlanId(activePlan.id); setEditingItem(null); setShowItemModal(true) }}>
                      アクションを追加
                    </Button>
                  </div>
                </div>
                {activePlan.action_items.length === 0 ? (
                  <div className="p-8 text-center text-sm text-slate-500">
                    アクションアイテムを追加してください
                  </div>
                ) : (
                  <GanttView
                    items={activePlan.action_items}
                    fiscalYear={project?.fiscal_year || new Date().getFullYear()}
                    onEditItem={(item) => { setActivePlanId(activePlan.id); setEditingItem(item); setShowItemModal(true) }}
                    onUpdateStatus={handleUpdateStatus}
                  />
                )}
              </Card>

              {/* List view */}
              <Card>
                <CardTitle>アクションアイテム一覧</CardTitle>
                <div className="mt-4 divide-y divide-slate-100">
                  {activePlan.action_items.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()).map(item => (
                    <div key={item.id} className="py-3">
                      <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-900">{item.title}</p>
                          <div className="flex gap-2 mt-1 flex-wrap">
                            <StatusBadge status={item.status} />
                            <span className="text-xs text-slate-500">{item.start_date} 〜 {item.end_date}</span>
                            {item.deliverable && <span className="text-xs text-slate-400">成果物: {item.deliverable}</span>}
                          </div>
                          {/* Progress bar */}
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 bg-slate-100 rounded-full h-2 max-w-xs">
                              <div
                                className={cn('h-2 rounded-full', item.progress_percent >= 100 ? 'bg-green-500' : item.progress_percent >= 50 ? 'bg-blue-500' : 'bg-yellow-500')}
                                style={{ width: `${item.progress_percent}%` }}
                              />
                            </div>
                            <span className="text-xs text-slate-500">{item.progress_percent}%</span>
                          </div>
                        </div>
                        <button onClick={() => { setActivePlanId(activePlan.id); setEditingItem(item); setShowItemModal(true) }} className="text-slate-400 hover:text-blue-600 p-1 ml-2">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </>
          )}
        </>
      )}

      {showPlanModal && (
        <PlanCreateModal onSave={handleCreatePlan} onClose={() => setShowPlanModal(false)} />
      )}
      {showItemModal && (
        <Modal open title={editingItem ? 'アクションアイテムを編集' : 'アクションアイテムを追加'} onClose={() => { setShowItemModal(false); setEditingItem(null) }} size="lg">
          <ItemForm item={editingItem} onSave={handleSaveItem} onClose={() => { setShowItemModal(false); setEditingItem(null) }} />
        </Modal>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ActionItemStatus }) {
  const variant = {
    not_started: 'default' as const,
    in_progress: 'info' as const,
    completed: 'success' as const,
    delayed: 'danger' as const,
    cancelled: 'default' as const,
  }
  return <Badge variant={variant[status]}>{ACTION_ITEM_STATUS_LABELS[status]}</Badge>
}

function GanttView({ items, fiscalYear, onEditItem, onUpdateStatus }: {
  items: ActionItem[]
  fiscalYear: number
  onEditItem: (item: ActionItem) => void
  onUpdateStatus: (id: string, status: ActionItemStatus, progress: number) => void
}) {
  const months = useMemo(() => {
    const m: { label: string; date: Date }[] = []
    for (let i = 0; i < 12; i++) {
      const d = new Date(fiscalYear, 3 + i, 1) // Start from April
      m.push({ label: `${d.getMonth() + 1}月`, date: d })
    }
    return m
  }, [fiscalYear])

  const startDate = months[0].date
  const endDate = new Date(months[11].date.getFullYear(), months[11].date.getMonth() + 1, 0)
  const totalDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)

  const getPosition = (dateStr: string) => {
    const d = new Date(dateStr)
    const days = (d.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    return Math.max(0, Math.min(100, (days / totalDays) * 100))
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[800px]">
        {/* Header */}
        <div className="flex border-b border-slate-200">
          <div className="w-48 shrink-0 px-4 py-2 text-xs font-semibold text-slate-500">アクション</div>
          <div className="flex-1 flex">
            {months.map((m, i) => (
              <div key={i} className="flex-1 text-center text-xs text-slate-400 py-2 border-l border-slate-100">
                {m.label}
              </div>
            ))}
          </div>
        </div>
        {/* Rows */}
        {items.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime()).map(item => {
          const left = getPosition(item.start_date)
          const right = getPosition(item.end_date)
          const width = Math.max(right - left, 2)
          const barColor = item.status === 'completed' ? 'bg-green-400' : item.status === 'delayed' ? 'bg-red-400' : item.status === 'in_progress' ? 'bg-blue-400' : 'bg-slate-300'
          return (
            <div key={item.id} className="flex border-b border-slate-50 hover:bg-slate-50 group">
              <div className="w-48 shrink-0 px-4 py-2">
                <button onClick={() => onEditItem(item)} className="text-xs text-slate-700 hover:text-blue-600 text-left truncate block w-full">
                  {item.title}
                </button>
              </div>
              <div className="flex-1 relative h-10">
                <div
                  className={cn('absolute top-2 h-6 rounded-full cursor-pointer transition-colors', barColor)}
                  style={{ left: `${left}%`, width: `${width}%` }}
                  onClick={() => onEditItem(item)}
                  title={`${item.title} (${item.progress_percent}%)`}
                >
                  <div
                    className="h-full bg-white/30 rounded-full"
                    style={{ width: `${item.progress_percent}%` }}
                  />
                </div>
                {/* Month gridlines */}
                {months.map((_, i) => (
                  <div key={i} className="absolute top-0 bottom-0 border-l border-slate-100" style={{ left: `${(i / 12) * 100}%` }} />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function PlanCreateModal({ onSave, onClose }: { onSave: (title: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState('')
  return (
    <Modal open title="アクションプランを作成" onClose={onClose}>
      <div className="space-y-4">
        <Input label="プラン名" value={title} onChange={e => setTitle(e.target.value)} placeholder="例: Q1アクションプラン" required />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button onClick={() => onSave(title)} disabled={!title}>作成</Button>
        </div>
      </div>
    </Modal>
  )
}

function ItemForm({ item, onSave, onClose }: { item: ActionItem | null; onSave: (f: Partial<ActionItem>) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    title: item?.title || '',
    description: item?.description || '',
    start_date: item?.start_date || '',
    end_date: item?.end_date || '',
    deliverable: item?.deliverable || '',
    status: item?.status || 'not_started' as ActionItemStatus,
    progress_percent: item?.progress_percent || 0,
  })
  return (
    <div className="space-y-4">
      <Input label="アクション名" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
      <Textarea label="詳細説明" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
      <div className="grid grid-cols-2 gap-4">
        <Input label="開始日" type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} required />
        <Input label="完了日" type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} required />
      </div>
      <Input label="成果物" value={form.deliverable} onChange={e => setForm({ ...form, deliverable: e.target.value })} placeholder="例: 調査報告書、提案書" />
      <div className="grid grid-cols-2 gap-4">
        <Select
          label="ステータス"
          value={form.status}
          onChange={e => setForm({ ...form, status: e.target.value as ActionItemStatus })}
          options={Object.entries(ACTION_ITEM_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
        />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">進捗率 ({form.progress_percent}%)</label>
          <input
            type="range"
            min="0"
            max="100"
            step="5"
            value={form.progress_percent}
            onChange={e => setForm({ ...form, progress_percent: parseInt(e.target.value) })}
            className="w-full"
          />
        </div>
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button onClick={() => onSave(form)} disabled={!form.title || !form.start_date || !form.end_date}>保存</Button>
      </div>
    </div>
  )
}
