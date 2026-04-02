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
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { callAI, parseAIJsonResponse } from '@/lib/ai/helpers'
import { hasPermission } from '@/lib/permissions'
import { GAP_ANALYSIS_SYSTEM_PROMPT, GAP_ANALYSIS_USER_PROMPT } from '@/lib/ai/prompts/gap-analysis'
import type { Strategy, Measure, StrategyMeasureLink } from '@/types'

export default function StrategiesPage() {
  const { project, role, departments } = useProjectContext()
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [measures, setMeasures] = useState<Measure[]>([])
  const [links, setLinks] = useState<StrategyMeasureLink[]>([])
  const [loading, setLoading] = useState(true)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysis, setAnalysis] = useState<Record<string, unknown> | null>(null)
  const [showStrategyModal, setShowStrategyModal] = useState(false)
  const [showMeasureModal, setShowMeasureModal] = useState(false)
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null)
  const [editingMeasure, setEditingMeasure] = useState<Measure | null>(null)
  const { toast } = useToast()
  const supabase = createClient()
  const canEdit = role ? hasPermission(role, 'strategies:edit') : false

  useEffect(() => {
    if (!project) return
    const fetchAll = async () => {
      const [stratRes, measRes, linkRes] = await Promise.all([
        supabase.from('strategies').select('*').eq('project_id', project.id).order('sort_order'),
        supabase.from('measures').select('*').eq('project_id', project.id).order('sort_order'),
        supabase.from('strategy_measure_links').select('*'),
      ])
      if (stratRes.data) setStrategies(stratRes.data)
      if (measRes.data) setMeasures(measRes.data)
      if (linkRes.data) {
        const projectStratIds = new Set((stratRes.data || []).map((s: Strategy) => s.id))
        setLinks(linkRes.data.filter((l: StrategyMeasureLink) => projectStratIds.has(l.strategy_id)))
      }
      setLoading(false)
    }
    fetchAll()
  }, [project, supabase])

  const getMeasuresForStrategy = (strategyId: string) => {
    const measureIds = links.filter(l => l.strategy_id === strategyId).map(l => l.measure_id)
    return measures.filter(m => measureIds.includes(m.id))
  }

  const getUnlinkedMeasures = () => {
    const linkedIds = new Set(links.map(l => l.measure_id))
    return measures.filter(m => !linkedIds.has(m.id))
  }

  const handleLinkMeasure = async (strategyId: string, measureId: string) => {
    try {
      const { data, error } = await supabase.from('strategy_measure_links').insert({
        strategy_id: strategyId,
        measure_id: measureId,
        linked_by: 'manual',
      }).select().single()
      if (error) throw error
      if (data) setLinks(prev => [...prev, data])
      toast('紐付けしました', 'success')
    } catch {
      toast('紐付けに失敗しました', 'error')
    }
  }

  const handleUnlinkMeasure = async (strategyId: string, measureId: string) => {
    try {
      await supabase.from('strategy_measure_links').delete().eq('strategy_id', strategyId).eq('measure_id', measureId)
      setLinks(prev => prev.filter(l => !(l.strategy_id === strategyId && l.measure_id === measureId)))
      toast('紐付けを解除しました', 'success')
    } catch {
      toast('解除に失敗しました', 'error')
    }
  }

  const handleGapAnalysis = async () => {
    setAnalyzing(true)
    try {
      const stratStr = strategies.map((s, i) => `${i + 1}. ${s.title}: ${s.description || ''}`).join('\n')
      const measStr = measures.map((m, i) => `${i + 1}. ${m.title}: ${m.description || ''}`).join('\n')
      const data = await callAI('gap-analysis', {
        messages: [{ role: 'user', content: GAP_ANALYSIS_USER_PROMPT(stratStr, measStr) }],
        system: GAP_ANALYSIS_SYSTEM_PROMPT,
      })
      const result = parseAIJsonResponse(data)
      if (result && typeof result === 'object') {
        setAnalysis((result as Record<string, unknown>).analysis as Record<string, unknown> || result as Record<string, unknown>)
      }
    } catch {
      toast('分析に失敗しました', 'error')
    } finally {
      setAnalyzing(false)
    }
  }

  const handleSaveStrategy = async (form: { title: string; description: string }) => {
    if (!project) return
    try {
      if (editingStrategy) {
        await supabase.from('strategies').update(form).eq('id', editingStrategy.id)
        setStrategies(prev => prev.map(s => s.id === editingStrategy.id ? { ...s, ...form } as Strategy : s))
      } else {
        const { data } = await supabase.from('strategies').insert({ ...form, project_id: project.id, sort_order: strategies.length }).select().single()
        if (data) setStrategies(prev => [...prev, data])
      }
      toast('保存しました', 'success')
      setShowStrategyModal(false)
      setEditingStrategy(null)
    } catch {
      toast('保存に失敗しました', 'error')
    }
  }

  const handleSaveMeasure = async (form: { title: string; description: string; department_id: string }) => {
    if (!project) return
    try {
      if (editingMeasure) {
        await supabase.from('measures').update(form).eq('id', editingMeasure.id)
        setMeasures(prev => prev.map(m => m.id === editingMeasure.id ? { ...m, ...form } as Measure : m))
      } else {
        const { data } = await supabase.from('measures').insert({ ...form, project_id: project.id, sort_order: measures.length }).select().single()
        if (data) setMeasures(prev => [...prev, data])
      }
      toast('保存しました', 'success')
      setShowMeasureModal(false)
      setEditingMeasure(null)
    } catch {
      toast('保存に失敗しました', 'error')
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">戦略・施策管理</h2>
        <div className="flex gap-2">
          {canEdit && (
            <>
              <Button variant="secondary" onClick={() => { setEditingMeasure(null); setShowMeasureModal(true) }}>施策を追加</Button>
              <Button onClick={() => { setEditingStrategy(null); setShowStrategyModal(true) }}>戦略を追加</Button>
            </>
          )}
        </div>
      </div>

      {strategies.length === 0 ? (
        <Card>
          <EmptyState title="戦略がまだ登録されていません" description="事業計画書をアップロードするとAIが自動抽出します。" />
        </Card>
      ) : (
        strategies.map(strategy => {
          const linkedMeasures = getMeasuresForStrategy(strategy.id)
          return (
            <Card key={strategy.id}>
              <div className="flex items-start justify-between mb-4">
                <div>
                  <Badge variant="info">戦略</Badge>
                  <h3 className="text-base font-semibold text-slate-900 mt-1">{strategy.title}</h3>
                  {strategy.description && <p className="text-sm text-slate-500 mt-1">{strategy.description}</p>}
                </div>
                {canEdit && (
                  <button onClick={() => { setEditingStrategy(strategy); setShowStrategyModal(true) }} className="text-slate-400 hover:text-blue-600 p-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                  </button>
                )}
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-slate-400 uppercase">紐付いた施策</p>
                {linkedMeasures.length === 0 ? (
                  <p className="text-sm text-slate-400">施策が紐付いていません</p>
                ) : (
                  linkedMeasures.map(m => (
                    <div key={m.id} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                      <div>
                        <span className="text-sm text-slate-700">{m.title}</span>
                        {m.department_id && departments.find(d => d.id === m.department_id) && (
                          <Badge variant="default" className="ml-2">{departments.find(d => d.id === m.department_id)?.name}</Badge>
                        )}
                      </div>
                      {canEdit && (
                        <button onClick={() => handleUnlinkMeasure(strategy.id, m.id)} className="text-xs text-red-500 hover:text-red-700">解除</button>
                      )}
                    </div>
                  ))
                )}
                {canEdit && getUnlinkedMeasures().length > 0 && (
                  <select
                    className="mt-2 text-xs text-slate-500 border border-slate-200 rounded px-2 py-1"
                    onChange={e => { if (e.target.value) handleLinkMeasure(strategy.id, e.target.value); e.target.value = '' }}
                    defaultValue=""
                  >
                    <option value="">+ 施策を紐付ける...</option>
                    {getUnlinkedMeasures().map(m => <option key={m.id} value={m.id}>{m.title}</option>)}
                  </select>
                )}
              </div>
            </Card>
          )
        })
      )}

      {/* Gap Analysis */}
      {strategies.length > 0 && measures.length > 0 && (role === 'consultant' || role === 'company_admin') && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>ヌケモレ分析</CardTitle>
            <Button variant="secondary" onClick={handleGapAnalysis} loading={analyzing}>
              AIで分析
            </Button>
          </div>
          {analysis && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <span className="text-sm text-slate-600">カバー率:</span>
                <div className="flex-1 bg-slate-100 rounded-full h-3">
                  <div className="bg-blue-600 h-3 rounded-full" style={{ width: `${(analysis as Record<string, unknown>).coverage_score || 0}%` }} />
                </div>
                <span className="text-sm font-semibold">{String((analysis as Record<string, unknown>).coverage_score || 0)}%</span>
              </div>
              {Array.isArray((analysis as Record<string, unknown>).gaps) && ((analysis as Record<string, unknown>).gaps as Array<Record<string, string>>).map((gap, i) => (
                <div key={i} className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <Badge variant="warning">{gap.priority}</Badge>
                  <p className="text-sm text-slate-700 mt-1">{gap.gap_description}</p>
                  <p className="text-xs text-blue-600 mt-1">提案: {gap.suggested_measure}</p>
                </div>
              ))}
              {typeof (analysis as Record<string, unknown>).overall_assessment === 'string' && (
                <p className="text-sm text-slate-600 bg-slate-50 rounded-lg p-3">{(analysis as Record<string, unknown>).overall_assessment as string}</p>
              )}
            </div>
          )}
        </Card>
      )}

      {showStrategyModal && (
        <Modal open title={editingStrategy ? '戦略を編集' : '戦略を追加'} onClose={() => { setShowStrategyModal(false); setEditingStrategy(null) }}>
          <StrategyForm initial={editingStrategy} onSave={handleSaveStrategy} onClose={() => { setShowStrategyModal(false); setEditingStrategy(null) }} />
        </Modal>
      )}
      {showMeasureModal && (
        <Modal open title={editingMeasure ? '施策を編集' : '施策を追加'} onClose={() => { setShowMeasureModal(false); setEditingMeasure(null) }}>
          <MeasureForm initial={editingMeasure} departments={departments} onSave={handleSaveMeasure} onClose={() => { setShowMeasureModal(false); setEditingMeasure(null) }} />
        </Modal>
      )}
    </div>
  )
}

function StrategyForm({ initial, onSave, onClose }: { initial: Strategy | null; onSave: (f: { title: string; description: string }) => void; onClose: () => void }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  return (
    <div className="space-y-4">
      <Input label="戦略タイトル" value={title} onChange={e => setTitle(e.target.value)} required />
      <Textarea label="説明" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button onClick={() => onSave({ title, description })} disabled={!title}>保存</Button>
      </div>
    </div>
  )
}

function MeasureForm({ initial, departments, onSave, onClose }: { initial: Measure | null; departments: { id: string; name: string }[]; onSave: (f: { title: string; description: string; department_id: string }) => void; onClose: () => void }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [departmentId, setDepartmentId] = useState(initial?.department_id || '')
  return (
    <div className="space-y-4">
      <Input label="施策タイトル" value={title} onChange={e => setTitle(e.target.value)} required />
      <Textarea label="説明" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
      <Select
        label="担当部門"
        value={departmentId}
        onChange={e => setDepartmentId(e.target.value)}
        options={departments.map(d => ({ value: d.id, label: d.name }))}
        placeholder="部門を選択..."
      />
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button onClick={() => onSave({ title, description, department_id: departmentId })} disabled={!title}>保存</Button>
      </div>
    </div>
  )
}
