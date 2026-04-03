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
  const [selectedTreeKpi, setSelectedTreeKpi] = useState<{ kpi: TreeKPI; ksfMeasureId: string | null } | null>(null)
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

        {/* Mind-Map Tree */}
        {tree && !generating && (
          <div className="overflow-x-auto pb-4">
            <div style={{ minWidth: 920, padding: '16px 0' }}>
              {tree.map((kgi, gi) => (
                <div key={gi} style={{ display: 'flex', alignItems: 'stretch', marginBottom: gi < tree.length - 1 ? 40 : 0 }}>
                  {/* KGI Node */}
                  <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, opacity: animStep >= 1 ? 1 : 0, transform: animStep >= 1 ? 'translateX(0) scale(1)' : 'translateX(-20px) scale(0.95)', transition: 'all 0.7s ease-out' }}>
                    <div style={{ width: 176, background: 'linear-gradient(135deg, #3b82f6 0%, #4f46e5 100%)', color: '#fff', borderRadius: 16, padding: '14px 16px', boxShadow: '0 8px 24px rgba(59,130,246,0.25)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 8, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" /></svg>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(191,219,254,0.9)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>KGI</span>
                      </div>
                      <p style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.4, margin: 0 }}>{kgi.kgi_title}</p>
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.12)', borderRadius: 8, padding: '4px 8px' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(191,219,254,0.8)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 12l2 2 4-4" /></svg>
                        <span style={{ fontSize: 11, color: 'rgba(219,234,254,0.9)', fontWeight: 500 }}>{kgi.kgi_target}</span>
                      </div>
                    </div>
                  </div>

                  {/* KGI→KSF Connector */}
                  <div style={{ flexShrink: 0, width: 40, display: 'flex', alignItems: 'center', position: 'relative', opacity: animStep >= 2 ? 1 : 0, transition: 'opacity 0.5s ease 0.3s' }}>
                    {/* Horizontal line */}
                    <div style={{ width: '100%', height: 2, background: 'linear-gradient(90deg, rgba(59,130,246,0.4), rgba(16,185,129,0.4))', borderRadius: 1 }} />
                    {/* Vertical trunk */}
                    {kgi.ksfs.length > 1 && (
                      <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'stretch' }}>
                        <div style={{ width: 2, background: 'linear-gradient(180deg, transparent 5%, rgba(16,185,129,0.35) 20%, rgba(16,185,129,0.35) 80%, transparent 95%)', borderRadius: 1, flexGrow: 1 }} />
                      </div>
                    )}
                  </div>

                  {/* KSF + KPI groups */}
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 16, flex: 1 }}>
                    {kgi.ksfs.map((ksf, si) => (
                      <div key={si} style={{ display: 'flex', alignItems: 'center' }}>
                        {/* KSF branch connector */}
                        <div style={{ flexShrink: 0, width: 16, display: 'flex', alignItems: 'center', opacity: animStep >= 2 ? 1 : 0, transition: `opacity 0.5s ease ${si * 0.15 + 0.4}s` }}>
                          <div style={{ width: '100%', height: 2, background: 'rgba(16,185,129,0.35)', borderRadius: 1 }} />
                        </div>

                        {/* KSF Node */}
                        <div style={{ flexShrink: 0, opacity: animStep >= 2 ? 1 : 0, transform: animStep >= 2 ? 'translateX(0) scale(1)' : 'translateX(-16px) scale(0.95)', transition: `all 0.7s ease-out ${si * 0.15 + 0.4}s` }}>
                          <div style={{ width: 196, background: 'linear-gradient(135deg, #34d399 0%, #14b8a6 100%)', color: '#fff', borderRadius: 14, padding: '12px 14px', boxShadow: '0 4px 16px rgba(16,185,129,0.2)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                              <div style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                              </div>
                              <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(167,243,208,0.9)', letterSpacing: '0.1em', textTransform: 'uppercase' as const }}>KSF</span>
                            </div>
                            <p style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.4, margin: 0 }}>{ksf.ksf_title}</p>
                          </div>
                        </div>

                        {/* KSF→KPI Connector */}
                        <div style={{ flexShrink: 0, width: 32, display: 'flex', alignItems: 'center', position: 'relative', opacity: animStep >= 3 ? 1 : 0, transition: `opacity 0.5s ease ${si * 0.15 + 0.7}s` }}>
                          <div style={{ width: '100%', height: 1.5, background: 'linear-gradient(90deg, rgba(16,185,129,0.3), rgba(148,163,184,0.3))', borderRadius: 1 }} />
                          {ksf.kpis.length > 1 && (
                            <div style={{ position: 'absolute', right: 0, top: 0, bottom: 0, display: 'flex', alignItems: 'stretch' }}>
                              <div style={{ width: 1.5, background: 'linear-gradient(180deg, transparent 8%, rgba(148,163,184,0.3) 25%, rgba(148,163,184,0.3) 75%, transparent 92%)', borderRadius: 1, flexGrow: 1 }} />
                            </div>
                          )}
                        </div>

                        {/* KPI Nodes */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {ksf.kpis.map((kpi, ki) => {
                            const isRegistered = kpis.some(k => k.name === kpi.name)
                            return (
                              <div key={ki} style={{ display: 'flex', alignItems: 'center' }}>
                                {/* KPI branch connector + dot */}
                                <div style={{ flexShrink: 0, width: 16, display: 'flex', alignItems: 'center', opacity: animStep >= 3 ? 1 : 0, transition: `opacity 0.5s ease ${si * 0.15 + ki * 0.1 + 0.8}s` }}>
                                  <div style={{ flex: 1, height: 1.5, background: 'rgba(148,163,184,0.3)', borderRadius: 1 }} />
                                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: isRegistered ? '#22c55e' : '#f59e0b', flexShrink: 0, marginLeft: -1 }} />
                                </div>

                                {/* KPI Card */}
                                <div
                                  onClick={() => setSelectedTreeKpi({ kpi, ksfMeasureId: ksf.ksf_measure_id })}
                                  style={{
                                    width: 210,
                                    borderRadius: 12,
                                    padding: '8px 12px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 8,
                                    cursor: 'pointer',
                                    border: isRegistered ? '1px solid rgba(34,197,94,0.3)' : '1px solid rgba(226,232,240,0.8)',
                                    background: isRegistered ? 'linear-gradient(90deg, rgba(240,253,244,1), rgba(236,253,245,0.5))' : '#fff',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                                    opacity: animStep >= 3 ? 1 : 0,
                                    transform: animStep >= 3 ? 'translateX(0) scale(1)' : 'translateX(-16px) scale(0.95)',
                                    transition: `all 0.7s ease-out ${si * 0.15 + ki * 0.1 + 0.8}s`,
                                  }}
                                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)' }}
                                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = '0 1px 3px rgba(0,0,0,0.06)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(0)' }}
                                >
                                  <div style={{
                                    width: 20, height: 20, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: isRegistered ? '#22c55e' : '#f1f5f9',
                                  }}>
                                    {isRegistered ? (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                                    ) : (
                                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6m6-10V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0h6m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14" /></svg>
                                    )}
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 600, color: isRegistered ? '#166534' : '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, flex: 1 }}>{kpi.name}</span>
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#cbd5e1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 20, paddingTop: 16, borderTop: '1px solid #f1f5f9', fontSize: 11, color: '#94a3b8' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #4f46e5)' }} />
                <span>KGI（重要目標達成指標）</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: 'linear-gradient(135deg, #34d399, #14b8a6)' }} />
                <span>KSF（重要成功要因）</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#f1f5f9', border: '1px solid #cbd5e1' }} />
                <span>KPI（未登録）</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
                <span>KPI（登録済み）</span>
              </div>
              <span style={{ marginLeft: 'auto', color: '#cbd5e1' }}>KPIをクリックで詳細表示</span>
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

      {/* KPI Detail Modal (from tree) */}
      {selectedTreeKpi && (
        <Modal open title="KPI詳細" onClose={() => setSelectedTreeKpi(null)} size="md">
          {(() => {
            const { kpi, ksfMeasureId } = selectedTreeKpi
            const isRegistered = kpis.some(k => k.name === kpi.name)
            return (
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{kpi.name}</h3>
                  {isRegistered && <Badge variant="success" className="mt-1">登録済み</Badge>}
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="text-xs font-medium text-slate-500 mb-1">説明</p>
                    <p className="text-sm text-slate-700">{kpi.description}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-400">参考目標値</p>
                      <p className="text-sm font-semibold text-blue-700 mt-0.5">{kpi.target_example}</p>
                      <p className="text-[10px] text-slate-400">※参考値です</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3">
                      <p className="text-xs text-slate-400">計測頻度</p>
                      <p className="text-sm font-semibold text-slate-700 mt-0.5">
                        {kpi.frequency === 'monthly' ? '月次' : kpi.frequency === 'weekly' ? '週次' : '四半期'}
                      </p>
                    </div>
                  </div>

                  <div className="bg-slate-50 rounded-lg p-3">
                    <p className="text-xs text-slate-400 mb-1">算出方法</p>
                    <p className="text-sm text-slate-700">{kpi.calculation}</p>
                  </div>
                </div>

                <div className="flex justify-end gap-3 pt-2 border-t border-slate-100">
                  <Button variant="secondary" onClick={() => setSelectedTreeKpi(null)}>閉じる</Button>
                  {!isRegistered && (
                    <Button onClick={async () => {
                      await handleRegisterKpi(kpi, ksfMeasureId)
                      setSelectedTreeKpi(null)
                    }}>このKPIを登録</Button>
                  )}
                </div>
              </div>
            )
          })()}
        </Modal>
      )}

      {/* Manual KPI Edit/Add Modal */}
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
