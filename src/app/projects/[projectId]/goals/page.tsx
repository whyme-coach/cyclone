'use client'

import { useState, useEffect } from 'react'
import { useProjectContext } from '../layout'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { hasPermission } from '@/lib/permissions'
import type { ManagementGoal, ProjectRole } from '@/types'

export default function GoalsPage() {
  const { project, role } = useProjectContext()
  const [goals, setGoals] = useState<ManagementGoal[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingGoal, setEditingGoal] = useState<ManagementGoal | null>(null)
  const { toast } = useToast()
  const supabase = createClient()
  const canEdit = role ? hasPermission(role, 'goals:edit') : false

  useEffect(() => {
    if (!project) return
    const fetch = async () => {
      const { data } = await supabase
        .from('management_goals')
        .select('*')
        .eq('project_id', project.id)
        .order('sort_order')
      if (data) setGoals(data)
    }
    fetch()
  }, [project, supabase])

  const handleSave = async (goal: Partial<ManagementGoal>) => {
    if (!project) return
    try {
      if (editingGoal) {
        const { error } = await supabase.from('management_goals').update(goal).eq('id', editingGoal.id)
        if (error) throw error
        setGoals(prev => prev.map(g => g.id === editingGoal.id ? { ...g, ...goal } as ManagementGoal : g))
      } else {
        const { data, error } = await supabase.from('management_goals').insert({
          ...goal,
          project_id: project.id,
          sort_order: goals.length,
        }).select().single()
        if (error) throw error
        if (data) setGoals(prev => [...prev, data])
      }
      toast('保存しました', 'success')
      setShowModal(false)
      setEditingGoal(null)
    } catch {
      toast('保存に失敗しました', 'error')
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('この経営目標を削除しますか？')) return
    try {
      await supabase.from('management_goals').delete().eq('id', id)
      setGoals(prev => prev.filter(g => g.id !== id))
      toast('削除しました', 'success')
    } catch {
      toast('削除に失敗しました', 'error')
    }
  }

  const quantitative = goals.filter(g => g.type === 'quantitative')
  const qualitative = goals.filter(g => g.type === 'qualitative')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">経営目標</h2>
        {canEdit && (
          <Button onClick={() => { setEditingGoal(null); setShowModal(true) }}>
            目標を追加
          </Button>
        )}
      </div>

      {goals.length === 0 ? (
        <Card>
          <EmptyState
            title="経営目標がまだ登録されていません"
            description="事業計画書をアップロードするとAIが自動抽出します。手動で追加も可能です。"
            action={canEdit ? <Button onClick={() => setShowModal(true)}>目標を追加</Button> : undefined}
          />
        </Card>
      ) : (
        <>
          <Card>
            <CardTitle>定量目標</CardTitle>
            {quantitative.length === 0 ? (
              <p className="text-sm text-slate-500 mt-2">定量目標はまだありません</p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {quantitative.map(goal => (
                  <GoalRow key={goal.id} goal={goal} canEdit={canEdit} onEdit={() => { setEditingGoal(goal); setShowModal(true) }} onDelete={() => handleDelete(goal.id)} />
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardTitle>定性目標</CardTitle>
            {qualitative.length === 0 ? (
              <p className="text-sm text-slate-500 mt-2">定性目標はまだありません</p>
            ) : (
              <div className="mt-4 divide-y divide-slate-100">
                {qualitative.map(goal => (
                  <GoalRow key={goal.id} goal={goal} canEdit={canEdit} onEdit={() => { setEditingGoal(goal); setShowModal(true) }} onDelete={() => handleDelete(goal.id)} />
                ))}
              </div>
            )}
          </Card>
        </>
      )}

      {showModal && (
        <GoalFormModal
          goal={editingGoal}
          onSave={handleSave}
          onClose={() => { setShowModal(false); setEditingGoal(null) }}
        />
      )}
    </div>
  )
}

function GoalRow({ goal, canEdit, onEdit, onDelete }: { goal: ManagementGoal; canEdit: boolean; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="py-3 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <Badge variant={goal.type === 'quantitative' ? 'info' : 'success'}>
            {goal.type === 'quantitative' ? '定量' : '定性'}
          </Badge>
          <span className="text-sm font-medium text-slate-900">{goal.title}</span>
        </div>
        {goal.description && <p className="text-xs text-slate-500">{goal.description}</p>}
        {goal.target_value && (
          <p className="text-xs text-blue-600 mt-1">目標値: {goal.target_value}{goal.target_unit}</p>
        )}
      </div>
      {canEdit && (
        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit} className="text-slate-400 hover:text-blue-600 p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button onClick={onDelete} className="text-slate-400 hover:text-red-600 p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      )}
    </div>
  )
}

function GoalFormModal({ goal, onSave, onClose }: { goal: ManagementGoal | null; onSave: (g: Partial<ManagementGoal>) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    type: (goal?.type || 'quantitative') as string,
    title: goal?.title || '',
    description: goal?.description || '',
    target_value: goal?.target_value || '',
    target_unit: goal?.target_unit || '',
  })

  return (
    <Modal open title={goal ? '経営目標を編集' : '経営目標を追加'} onClose={onClose}>
      <div className="space-y-4">
        <Select
          label="種別"
          value={form.type}
          onChange={e => setForm({ ...form, type: e.target.value })}
          options={[
            { value: 'quantitative', label: '定量目標' },
            { value: 'qualitative', label: '定性目標' },
          ]}
        />
        <Input label="タイトル" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} required />
        <Textarea label="説明" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
        {form.type === 'quantitative' && (
          <div className="grid grid-cols-2 gap-4">
            <Input label="目標値" value={form.target_value} onChange={e => setForm({ ...form, target_value: e.target.value })} />
            <Input label="単位" value={form.target_unit} onChange={e => setForm({ ...form, target_unit: e.target.value })} placeholder="円、%、件 等" />
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button onClick={() => onSave({ ...form, type: form.type as 'qualitative' | 'quantitative' })} disabled={!form.title}>保存</Button>
        </div>
      </div>
    </Modal>
  )
}
