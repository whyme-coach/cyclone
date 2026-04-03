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
import { GENERATE_KPI_TREE_SYSTEM_PROMPT, GENERATE_KPI_TREE_USER_PROMPT } from '@/lib/ai/prompts/generate-kpi-tree'
import { cn } from '@/lib/utils'
import type { KPI, Measure, ManagementGoal, Strategy, Company } from '@/types'

type TreeKPI = { name: string; description: string; target_example: string; unit: string; calculation: string; frequency: string; measure_ids?: string[] }
type TreeKSF = { ksf_title: string; ksf_measure_id: string | null; kpis: TreeKPI[] }
type TreeKGI = { kgi_title: string; kgi_target: string; ksfs: TreeKSF[] }
type KPITree = TreeKGI[]

export default function KPIsPage() {
  const params = useParams()
  const deptId = params.deptId as string
  const { project, company, departments } = useProjectContext()
  const [kpis, setKpis] = useState<KPI[]>([])
  const [measures, setMeasures] = useState<Measure[]>([])
  const [goals, setGoals] = useState<ManagementGoal[]>([])
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [tree, setTree] = useState<KPITree | null>(null)
  const [animStep, setAnimStep] = useState(0) // 0=none, 1=KGI, 2=KSF, 3=KPI
  const [saving, setSaving] = useState(false)
  const [expandedKpi, setExpandedKpi] = useState<string | null>(null) // "gi-si-ki" key
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

  const handleGenerateTree = async () => {
    console.log('[KPI] Generate tree clicked. measures:', measures.length, 'goals:', goals.length)
    setGenerating(true)
    setTree(null)
    setAnimStep(0)
    try {
      const comp = company as Company | null
      const goalsStr = goals.map(g => `- ${g.title}${g.target_value ? `（${g.target_value}${g.target_unit || ''}）` : ''} [${g.type}]`).join('\n')
      const stratStr = strategies.map(s => `- ${s.title}`).join('\n')
      const measStr = measures.map(m => `- [ID:${m.id}] ${m.title}${m.description ? `: ${m.description}` : ''}`).join('\n')

      const data = await callAI('generate-kpi-tree', {
        system: GENERATE_KPI_TREE_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: GENERATE_KPI_TREE_USER_PROMPT(
          department?.name || '',
          comp?.industry || '',
          comp?.business_description || '',
          goalsStr,
          stratStr,
          measStr,
        ) }],
      })
      console.log('[KPI] AI response received:', JSON.stringify(data).substring(0, 200))
      const result = parseAIJsonResponse(data) as { tree?: KPITree }
      console.log('[KPI] Parsed result:', result ? 'tree=' + (result.tree?.length || 0) + ' items' : 'null')
      if (result?.tree) {
        // Attach measure_ids to KPIs
        const enriched = result.tree.map(kgi => ({
          ...kgi,
          ksfs: kgi.ksfs.map(ksf => ({
            ...ksf,
            kpis: ksf.kpis.map(kpi => ({
              ...kpi,
              measure_ids: ksf.ksf_measure_id ? [ksf.ksf_measure_id] : [],
            })),
          })),
        }))
        setTree(enriched)
        // Animate: KGI → KSF → KPI
        setAnimStep(1)
        setTimeout(() => setAnimStep(2), 800)
        setTimeout(() => setAnimStep(3), 1600)
      }
    } catch (err) {
      console.error('[KPI] Error:', err)
      toast('KPIツリーの生成に失敗しました', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveTree = async () => {
    if (!tree || !project) return
    setSaving(true)
    try {
      const allKpis: Array<TreeKPI & { measure_ids: string[] }> = []
      for (const kgi of tree) {
        for (const ksf of kgi.ksfs) {
          for (const kpi of ksf.kpis) {
            allKpis.push({ ...kpi, measure_ids: kpi.measure_ids || (ksf.ksf_measure_id ? [ksf.ksf_measure_id] : []) })
          }
        }
      }
      const res = await fetch('/api/save-kpi-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: project.id, departmentId: deptId, kpis: allKpis }),
      })
      if (!res.ok) throw new Error()
      toast('KPIツリーを保存しました', 'success')
      // Refresh KPI list
      const { data } = await supabase.from('kpis').select('*').eq('project_id', project.id).eq('department_id', deptId).order('created_at')
      if (data) setKpis(data)
    } catch {
      toast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleRegisterKpi = async (kpi: TreeKPI, ksfMeasureId: string | null) => {
    if (!project) return
    try {
      const res = await fetch('/api/save-kpi-tree', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id, departmentId: deptId,
          kpis: [{ ...kpi, measure_ids: ksfMeasureId ? [ksfMeasureId] : [] }],
        }),
      })
      if (!res.ok) throw new Error()
      const { data } = await supabase.from('kpis').select('*').eq('project_id', project.id).eq('department_id', deptId).order('created_at')
      if (data) setKpis(data)
      toast(`「${kpi.name}」を登録しました`, 'success')
    } catch {
      toast('登録に失敗しました', 'error')
    }
  }

  const handleDeleteKpi = async (id: string) => {
    if (!confirm('このKPIを削除しますか？')) return
    await supabase.from('kpis').delete().eq('id', id)
    setKpis(prev => prev.filter(k => k.id !== id))
    toast('削除しました', 'success')
  }

  const handleSaveKpi = async (form: Partial<KPI>) => {
    if (!project) return
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
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">KPI設定</h2>
        <p className="text-sm text-slate-500 mt-1">{department?.name}</p>
      </div>

      {/* KPI Tree Generator */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <CardTitle>KPIツリー生成</CardTitle>
            <p className="text-sm text-slate-500 mt-1">AIが経営目標（KGI）→ 施策（KSF）→ KPI のツリーを自動生成します</p>
          </div>
          <Button onClick={handleGenerateTree} loading={generating}>
            {generating ? 'AI分析中...' : tree ? 'AI再生成' : 'AIでKPIツリーを生成'}
          </Button>
        </div>

        {generating && (
          <div className="flex items-center gap-3 p-6 bg-blue-50 rounded-lg">
            <Spinner size="sm" /><span className="text-sm text-blue-700">KGI → KSF → KPI のツリー構造を分析しています...</span>
          </div>
        )}

        {/* Animated Horizontal Tree */}
        {tree && !generating && (
          <div className="overflow-x-auto pb-4">
            <div className="min-w-[900px]">
              {tree.map((kgi, gi) => (
                <div key={gi} className="mb-6">
                  <div className="flex items-start gap-0">
                    {/* KGI Node */}
                    <div className={cn(
                      'shrink-0 w-48 transition-all duration-700',
                      animStep >= 1 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'
                    )}>
                      <div className="bg-blue-600 text-white rounded-xl p-3 shadow-lg">
                        <p className="text-[10px] font-bold opacity-70">KGI</p>
                        <p className="text-sm font-semibold mt-0.5">{kgi.kgi_title}</p>
                        <p className="text-xs opacity-80 mt-1">{kgi.kgi_target}</p>
                      </div>
                    </div>

                    {/* Connector */}
                    <div className={cn('shrink-0 w-8 flex items-center transition-all duration-500 delay-300', animStep >= 2 ? 'opacity-100' : 'opacity-0')}>
                      <div className="w-full h-px bg-slate-300" />
                    </div>

                    {/* KSF Column */}
                    <div className="shrink-0 space-y-2">
                      {kgi.ksfs.map((ksf, si) => (
                        <div key={si} className="flex items-start gap-0">
                          <div className={cn(
                            'shrink-0 w-52 transition-all duration-700',
                            animStep >= 2 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'
                          )} style={{ transitionDelay: `${si * 200 + 400}ms` }}>
                            <div className="bg-emerald-500 text-white rounded-xl p-3 shadow-md">
                              <p className="text-[10px] font-bold opacity-70">KSF（施策）</p>
                              <p className="text-xs font-semibold mt-0.5">{ksf.ksf_title}</p>
                            </div>
                          </div>

                          {/* Connector */}
                          <div className={cn('shrink-0 w-6 flex items-center transition-all duration-500', animStep >= 3 ? 'opacity-100' : 'opacity-0')} style={{ transitionDelay: `${si * 200 + 800}ms` }}>
                            <div className="w-full h-px bg-slate-300" />
                          </div>

                          {/* KPI Column */}
                          <div className="space-y-1.5">
                            {ksf.kpis.map((kpi, ki) => {
                              const key = `${gi}-${si}-${ki}`
                              const isExpanded = expandedKpi === key
                              const isRegistered = kpis.some(k => k.name === kpi.name)
                              return (
                                <div key={ki} className={cn(
                                  'transition-all duration-700',
                                  animStep >= 3 ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-8'
                                )} style={{ transitionDelay: `${si * 200 + ki * 150 + 1000}ms` }}>
                                  <div
                                    onClick={() => setExpandedKpi(isExpanded ? null : key)}
                                    className={cn(
                                      'rounded-xl shadow-sm cursor-pointer transition-all',
                                      isExpanded ? 'w-80' : 'w-52',
                                      isRegistered
                                        ? 'bg-green-50 border border-green-300'
                                        : 'bg-amber-50 border border-amber-200 hover:shadow-md'
                                    )}
                                  >
                                    <div className="p-2.5 flex items-center gap-1.5">
                                      <Badge variant={isRegistered ? 'success' : 'warning'}>{isRegistered ? '登録済' : 'KPI'}</Badge>
                                      <span className="text-xs font-semibold text-slate-800 truncate">{kpi.name}</span>
                                      <svg className={cn('w-3 h-3 text-slate-400 shrink-0 transition-transform ml-auto', isExpanded && 'rotate-180')} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                    {isExpanded && (
                                      <div className="px-3 pb-3 border-t border-amber-100 pt-2 space-y-2" onClick={e => e.stopPropagation()}>
                                        <p className="text-[11px] text-slate-600">{kpi.description}</p>
                                        <div className="flex gap-1.5 flex-wrap">
                                          <span className="text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-blue-600">参考: {kpi.target_example}</span>
                                          <span className="text-[10px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-500">{kpi.frequency === 'monthly' ? '月次' : kpi.frequency === 'weekly' ? '週次' : '四半期'}</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400">算出: {kpi.calculation}</p>
                                        {!isRegistered && (
                                          <Button size="sm" className="w-full mt-1" onClick={() => handleRegisterKpi(kpi, ksf.ksf_measure_id)}>
                                            このKPIを登録
                                          </Button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {!tree && !generating && measures.length === 0 && (
          <EmptyState title="施策が未登録です" description="初期設定で事業計画を登録すると、施策が表示されます" />
        )}
      </Card>

      {/* Registered KPIs */}
      <Card>
        <CardTitle>登録済みKPI（{kpis.length}件）</CardTitle>
        {kpis.length === 0 ? (
          <EmptyState title="KPIがまだ登録されていません" description="上のツリー生成でKPIを作成するか、手動で追加できます" />
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {kpis.map(kpi => (
              <div key={kpi.id} className="py-3 flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900">{kpi.name}</p>
                  {kpi.description && <p className="text-xs text-slate-500 mt-0.5 whitespace-pre-line line-clamp-3">{kpi.description}</p>}
                  <div className="flex gap-2 mt-1.5 flex-wrap">
                    {kpi.target_value != null && <Badge variant="info">目標: {kpi.target_value} {kpi.target_unit}</Badge>}
                    <Badge variant="default">{kpi.frequency === 'monthly' ? '月次' : kpi.frequency === 'weekly' ? '週次' : '四半期'}</Badge>
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
            ))}
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <Button variant="secondary" size="sm" onClick={() => { setEditingKpi(null); setShowModal(true) }}>+ KPIを手動で追加</Button>
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
    name: kpi?.name || '', description: kpi?.description || '', measure_id: kpi?.measure_id || '',
    target_value: kpi?.target_value?.toString() || '', target_unit: kpi?.target_unit || '',
    frequency: (kpi?.frequency || 'monthly') as string,
  })
  return (
    <div className="space-y-4">
      <Input label="KPI名" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
      <Textarea label="説明・算出方法" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} />
      <Select label="関連施策" value={form.measure_id} onChange={e => setForm({ ...form, measure_id: e.target.value })} options={measures.map(m => ({ value: m.id, label: m.title }))} placeholder="施策を選択..." />
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
