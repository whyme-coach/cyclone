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
import { createClient } from '@/lib/supabase/client'
import { callAI, parseAIJsonResponse } from '@/lib/ai/helpers'
import { SUGGEST_KPIS_SYSTEM_PROMPT, SUGGEST_KPIS_USER_PROMPT } from '@/lib/ai/prompts/suggest-kpis'
import type { KPI, Measure, ManagementGoal, Strategy, Company } from '@/types'

type SuggestedKPI = {
  name: string; description: string; target_value_example: string; target_unit: string
  calculation_method: string; frequency: string; priority: string
}

export default function KPIsPage() {
  const params = useParams()
  const deptId = params.deptId as string
  const { project, company, departments } = useProjectContext()
  const [kpis, setKpis] = useState<KPI[]>([])
  const [measures, setMeasures] = useState<Measure[]>([])
  const [goals, setGoals] = useState<ManagementGoal[]>([])
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [loading, setLoading] = useState(true)
  const [suggesting, setSuggesting] = useState(false)
  const [selectedMeasureId, setSelectedMeasureId] = useState('')
  const [suggestions, setSuggestions] = useState<SuggestedKPI[]>([])
  const [showModal, setShowModal] = useState(false)
  const [editingKpi, setEditingKpi] = useState<KPI | null>(null)
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const department = departments.find(d => d.id === deptId)

  useEffect(() => {
    if (!project) return
    const fetchAll = async () => {
      const [kpiRes, measRes, goalRes, stratRes] = await Promise.all([
        supabase.from('kpis').select('*').eq('project_id', project.id).eq('department_id', deptId).order('created_at'),
        supabase.from('measures').select('*').eq('project_id', project.id).eq('department_id', deptId).order('sort_order'),
        supabase.from('management_goals').select('*').eq('project_id', project.id).order('sort_order'),
        supabase.from('strategies').select('*').eq('project_id', project.id).order('sort_order'),
      ])
      if (kpiRes.data) setKpis(kpiRes.data)
      if (measRes.data) setMeasures(measRes.data)
      if (goalRes.data) setGoals(goalRes.data)
      if (stratRes.data) setStrategies(stratRes.data)
      setLoading(false)
    }
    fetchAll()
  }, [project, deptId, supabase])

  const handleSuggestKpis = async () => {
    const measure = measures.find(m => m.id === selectedMeasureId)
    if (!measure) { toast('施策を選択してください', 'error'); return }
    setSuggesting(true)
    setSuggestions([])
    try {
      const goalsStr = goals.map(g => `${g.title}${g.target_value ? `(${g.target_value}${g.target_unit || ''})` : ''}`).join(', ')
      const stratStr = strategies.map(s => s.title).join(', ')
      const comp = company as Company | null
      const data = await callAI('suggest-kpis', {
        model: 'claude-sonnet-4-6',
        messages: [{ role: 'user', content: SUGGEST_KPIS_USER_PROMPT(
          measure.title + (measure.description ? `: ${measure.description}` : ''),
          department?.name || '',
          goalsStr,
          comp?.industry || '',
          comp?.business_description || '',
          stratStr,
        ) }],
        system: SUGGEST_KPIS_SYSTEM_PROMPT,
      })
      const result = parseAIJsonResponse(data) as { kpis?: SuggestedKPI[] }
      if (result?.kpis) {
        setSuggestions(result.kpis.slice(0, 5))
        toast(`${result.kpis.length}件のKPIを提案しました`, 'success')
      }
    } catch {
      toast('KPI提案の取得に失敗しました', 'error')
    } finally {
      setSuggesting(false)
    }
  }

  const handleAcceptSuggestion = async (s: SuggestedKPI) => {
    if (!project) return
    try {
      const { data, error } = await supabase.from('kpis').insert({
        project_id: project.id,
        department_id: deptId,
        measure_id: selectedMeasureId || null,
        name: s.name,
        description: `${s.description}\n\n【算出方法】${s.calculation_method}`,
        target_unit: s.target_unit,
        frequency: s.frequency as 'weekly' | 'monthly' | 'quarterly',
      }).select().single()
      if (error) throw error
      if (data) setKpis(prev => [...prev, data])
      setSuggestions(prev => prev.filter(sg => sg.name !== s.name))
      toast('KPIを採用しました', 'success')
    } catch {
      toast('追加に失敗しました', 'error')
    }
  }

  const handleSaveKpi = async (form: Partial<KPI>) => {
    if (!project) return
    try {
      if (editingKpi) {
        await supabase.from('kpis').update(form).eq('id', editingKpi.id)
        setKpis(prev => prev.map(k => k.id === editingKpi.id ? { ...k, ...form } as KPI : k))
      } else {
        const { data } = await supabase.from('kpis').insert({ ...form, project_id: project.id, department_id: deptId }).select().single()
        if (data) setKpis(prev => [...prev, data])
      }
      toast('保存しました', 'success')
      setShowModal(false)
      setEditingKpi(null)
    } catch {
      toast('保存に失敗しました', 'error')
    }
  }

  const handleDeleteKpi = async (id: string) => {
    if (!confirm('このKPIを削除しますか？')) return
    try {
      await supabase.from('kpis').delete().eq('id', id)
      setKpis(prev => prev.filter(k => k.id !== id))
      toast('削除しました', 'success')
    } catch {
      toast('削除に失敗しました', 'error')
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  const priorityVariant = (p: string) => p === 'high' ? 'danger' as const : p === 'medium' ? 'warning' as const : 'default' as const
  const priorityLabel = (p: string) => p === 'high' ? '重要度：高' : p === 'medium' ? '重要度：中' : '重要度：低'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">KPI管理</h2>
        <p className="text-sm text-slate-500 mt-1">{department?.name}</p>
      </div>

      {/* AI Suggestion Section */}
      {measures.length > 0 && (
        <Card>
          <CardTitle>AI KPI提案</CardTitle>
          <p className="text-sm text-slate-500 mt-1 mb-4">施策を選択して、AIにKPIを提案してもらいましょう</p>

          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <Select
                label="施策を選択"
                value={selectedMeasureId}
                onChange={e => { setSelectedMeasureId(e.target.value); setSuggestions([]) }}
                options={measures.map(m => ({ value: m.id, label: m.title }))}
                placeholder="施策を選択してください"
              />
            </div>
            <Button onClick={handleSuggestKpis} loading={suggesting} disabled={!selectedMeasureId}>
              AI提案
            </Button>
          </div>

          {suggesting && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg mt-4">
              <Spinner size="sm" /><span className="text-sm text-blue-700">AIがKPIを分析しています...</span>
            </div>
          )}

          {suggestions.length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase">提案されたKPI（{suggestions.length}件）</p>
              {suggestions.map((s, i) => (
                <div key={i} className="border border-blue-200 bg-blue-50/50 rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-slate-900">{s.name}</span>
                        <Badge variant={priorityVariant(s.priority)}>{priorityLabel(s.priority)}</Badge>
                      </div>
                      <p className="text-xs text-slate-600 mt-1">{s.description}</p>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                        <div className="bg-white rounded p-2 border border-slate-100">
                          <span className="text-slate-400">参考目標値：</span>
                          <span className="text-blue-700 font-medium">{s.target_value_example}</span>
                          <span className="text-slate-400 ml-0.5">（参考値）</span>
                        </div>
                        <div className="bg-white rounded p-2 border border-slate-100">
                          <span className="text-slate-400">計測頻度：</span>
                          <span className="text-slate-700">{s.frequency === 'monthly' ? '月次' : s.frequency === 'weekly' ? '週次' : '四半期'}</span>
                        </div>
                      </div>
                      <div className="mt-2 bg-white rounded p-2 border border-slate-100 text-xs">
                        <span className="text-slate-400">算出方法：</span>
                        <span className="text-slate-700">{s.calculation_method}</span>
                      </div>
                    </div>
                    <Button size="sm" onClick={() => handleAcceptSuggestion(s)} className="shrink-0">採用</Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Registered KPIs */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <CardTitle>登録済みKPI（{kpis.length}件）</CardTitle>
        </div>

        {kpis.length === 0 ? (
          <EmptyState title="KPIがまだ登録されていません" description="AIに提案してもらうか、手動で追加できます。" />
        ) : (
          <div className="divide-y divide-slate-100">
            {kpis.map(kpi => (
              <div key={kpi.id} className="py-4 first:pt-0 last:pb-0">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900">{kpi.name}</p>
                    {kpi.description && <p className="text-xs text-slate-500 mt-1 whitespace-pre-line">{kpi.description}</p>}
                    <div className="flex gap-3 mt-2 flex-wrap">
                      {kpi.target_value != null && (
                        <Badge variant="info">目標: {kpi.target_value} {kpi.target_unit}</Badge>
                      )}
                      {kpi.current_value != null && (
                        <Badge variant={kpi.current_value >= (kpi.target_value || 0) ? 'success' : 'warning'}>
                          実績: {kpi.current_value} {kpi.target_unit}
                        </Badge>
                      )}
                      <Badge variant="default">
                        {kpi.frequency === 'monthly' ? '月次' : kpi.frequency === 'weekly' ? '週次' : '四半期'}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0 ml-2">
                    <button onClick={() => { setEditingKpi(kpi); setShowModal(true) }} className="text-slate-400 hover:text-blue-600 p-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                    </button>
                    <button onClick={() => handleDeleteKpi(kpi.id)} className="text-slate-400 hover:text-red-600 p-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add KPI button at bottom */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <Button variant="secondary" size="sm" onClick={() => { setEditingKpi(null); setShowModal(true) }}>
            + KPIを手動で追加
          </Button>
        </div>
      </Card>

      {showModal && (
        <Modal open title={editingKpi ? 'KPIを編集' : 'KPIを追加'} onClose={() => { setShowModal(false); setEditingKpi(null) }}>
          <KpiForm kpi={editingKpi} measures={measures} onSave={handleSaveKpi} onClose={() => { setShowModal(false); setEditingKpi(null) }} />
        </Modal>
      )}
    </div>
  )
}

function KpiForm({ kpi, measures, onSave, onClose }: { kpi: KPI | null; measures: Measure[]; onSave: (f: Partial<KPI>) => void; onClose: () => void }) {
  const [form, setForm] = useState({
    name: kpi?.name || '',
    description: kpi?.description || '',
    measure_id: kpi?.measure_id || '',
    target_value: kpi?.target_value?.toString() || '',
    target_unit: kpi?.target_unit || '',
    frequency: (kpi?.frequency || 'monthly') as string,
  })
  return (
    <div className="space-y-4">
      <Input label="KPI名" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
      <Textarea label="説明・算出方法" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
      <Select
        label="関連施策"
        value={form.measure_id}
        onChange={e => setForm({ ...form, measure_id: e.target.value })}
        options={measures.map(m => ({ value: m.id, label: m.title }))}
        placeholder="施策を選択..."
      />
      <div className="grid grid-cols-3 gap-4">
        <Input label="目標値" type="number" value={form.target_value} onChange={e => setForm({ ...form, target_value: e.target.value })} />
        <Input label="単位" value={form.target_unit} onChange={e => setForm({ ...form, target_unit: e.target.value })} placeholder="件、円、%" />
        <Select label="計測頻度" value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} options={[{ value: 'weekly', label: '週次' }, { value: 'monthly', label: '月次' }, { value: 'quarterly', label: '四半期' }]} />
      </div>
      <div className="flex justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onClose}>キャンセル</Button>
        <Button onClick={() => onSave({ ...form, frequency: form.frequency as 'weekly' | 'monthly' | 'quarterly', target_value: form.target_value ? parseFloat(form.target_value) : undefined, measure_id: form.measure_id || undefined })} disabled={!form.name}>保存</Button>
      </div>
    </div>
  )
}
