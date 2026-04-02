'use client'

import { useState, useEffect } from 'react'
import { useProjectContext } from '../layout'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { callAI, parseAIJsonResponse } from '@/lib/ai/helpers'
import { safeStoragePath } from '@/lib/storage'
import { INDUSTRIES, SETUP_STEPS } from '@/lib/constants'
import { EXTRACT_BUSINESS_PLAN_SYSTEM_PROMPT, EXTRACT_BUSINESS_PLAN_USER_PROMPT } from '@/lib/ai/prompts/extract-business-plan'
import { EXTRACT_ORG_CHART_SYSTEM_PROMPT, EXTRACT_ORG_CHART_USER_PROMPT, EXTRACT_RESPONSIBILITIES_SYSTEM_PROMPT, EXTRACT_RESPONSIBILITIES_USER_PROMPT } from '@/lib/ai/prompts/extract-org-chart'
import { cn } from '@/lib/utils'
import type { Company, ManagementGoal, Strategy, Measure, Department, BusinessPlanExtraction } from '@/types'

export default function SetupPage() {
  const { project, company, refreshProject } = useProjectContext()
  const [currentStep, setCurrentStep] = useState(project?.current_setup_step || 1)
  const { toast } = useToast()
  const supabase = createClient()

  if (!project || !company) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">初期設定</h2>
        <p className="text-sm text-slate-500 mt-1">事業計画の実行支援に必要な情報を設定します</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 flex-wrap">
        {SETUP_STEPS.map((step, idx) => (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => setCurrentStep(step.id)}
              className={cn(
                'flex items-center gap-2 px-3 py-1.5 rounded-full text-sm transition-colors',
                currentStep === step.id
                  ? 'bg-blue-600 text-white'
                  : step.id < currentStep
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-slate-100 text-slate-500'
              )}
            >
              <span className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
                {step.id}
              </span>
              {step.label}
            </button>
            {idx < SETUP_STEPS.length - 1 && (
              <div className="w-8 h-px bg-slate-300 mx-1" />
            )}
          </div>
        ))}
      </div>

      {currentStep === 1 && (
        <CompanyInfoStep company={company} projectId={project.id} onNext={() => setCurrentStep(2)} supabase={supabase} toast={toast} />
      )}
      {currentStep === 2 && (
        <BusinessPlanStep projectId={project.id} onNext={() => setCurrentStep(3)} onBack={() => setCurrentStep(1)} supabase={supabase} toast={toast} />
      )}
      {currentStep === 3 && (
        <OrgChartStep projectId={project.id} onNext={() => setCurrentStep(4)} onBack={() => setCurrentStep(2)} supabase={supabase} toast={toast} refreshProject={refreshProject} />
      )}
      {currentStep === 4 && (
        <StrategyLinkStep projectId={project.id} onNext={() => setCurrentStep(5)} onBack={() => setCurrentStep(3)} supabase={supabase} toast={toast} />
      )}
      {currentStep === 5 && (
        <InviteMembersStep projectId={project.id} onBack={() => setCurrentStep(4)} />
      )}
    </div>
  )
}

// ============================================================
// Step 1: Company Info (unchanged)
// ============================================================
function CompanyInfoStep({ company, projectId, onNext, supabase, toast }: {
  company: Company; projectId: string; onNext: () => void; supabase: ReturnType<typeof createClient>; toast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [url, setUrl] = useState(company.website || '')
  const [scraping, setScraping] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: company.name || '', name_kana: company.name_kana || '', address: company.address || '',
    established_date: company.established_date || '', capital: company.capital?.toString() || '',
    industry: company.industry || '', business_description: company.business_description || '',
    employee_count: company.employee_count || '', representative: company.representative || '', phone: company.phone || '',
  })

  const handleScrape = async () => {
    if (!url) return
    setScraping(true)
    try {
      const data = await callAI('scrape-company', {
        messages: [{ role: 'user', content: `以下の会社のWebサイトから企業情報を取得してJSON形式で返してください。URL: ${url}\n\n必ず以下のJSON形式で返してください:\n{"name":"","name_kana":"","address":"","established_date":"","capital":"","industry":"","business_description":"","employee_count":"","representative":"","phone":""}` }],
        tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }],
      })
      const result = parseAIJsonResponse(data)
      if (result && typeof result === 'object') {
        const r = result as Record<string, string>
        setForm(prev => ({ ...prev, ...Object.fromEntries(Object.entries(r).filter(([, v]) => v)) }))
        toast('企業情報を取得しました', 'success')
      }
    } catch { toast('企業情報の取得に失敗しました', 'error') }
    finally { setScraping(false) }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await supabase.from('companies').update({ ...form, website: url, capital: form.capital ? parseInt(form.capital.replace(/,/g, '')) : null }).eq('id', company.id)
      toast('保存しました', 'success')
      onNext()
    } catch { toast('保存に失敗しました', 'error') }
    finally { setSaving(false) }
  }

  return (
    <Card>
      <CardTitle>会社基本情報</CardTitle>
      <p className="text-sm text-slate-500 mt-1 mb-6">会社URLを入力してAIが企業情報を取得します</p>
      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1"><Input label="会社URL" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://www.example.co.jp" /></div>
          <div className="pt-6"><Button onClick={handleScrape} loading={scraping} variant="secondary">AI取得</Button></div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Input label="商号" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <Input label="商号（フリガナ）" value={form.name_kana} onChange={e => setForm({ ...form, name_kana: e.target.value })} />
        </div>
        <Input label="本店所在地" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
        <div className="grid grid-cols-3 gap-4">
          <Input label="設立年月日" value={form.established_date} onChange={e => setForm({ ...form, established_date: e.target.value })} />
          <Input label="資本金" value={form.capital} onChange={e => setForm({ ...form, capital: e.target.value })} />
          <Select label="業種" value={form.industry} onChange={e => setForm({ ...form, industry: e.target.value })} options={INDUSTRIES.map(i => ({ value: i, label: i }))} placeholder="選択してください" />
        </div>
        <Textarea label="事業内容" value={form.business_description} onChange={e => setForm({ ...form, business_description: e.target.value })} rows={3} />
        <div className="grid grid-cols-3 gap-4">
          <Input label="従業員数" value={form.employee_count} onChange={e => setForm({ ...form, employee_count: e.target.value })} />
          <Input label="代表者" value={form.representative} onChange={e => setForm({ ...form, representative: e.target.value })} />
          <Input label="電話番号" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        </div>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
        <Button onClick={handleSave} loading={saving}>保存して次へ</Button>
      </div>
    </Card>
  )
}

// ============================================================
// Step 2: Business Plan Upload + AI Extraction
// ============================================================
function BusinessPlanStep({ projectId, onNext, onBack, supabase, toast }: {
  projectId: string; onNext: () => void; onBack: () => void; supabase: ReturnType<typeof createClient>; toast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const { project } = useProjectContext()
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<BusinessPlanExtraction | null>(null)
  const [saved, setSaved] = useState(false)

  // Load existing data on mount
  useEffect(() => {
    const loadExisting = async () => {
      // Check uploaded file
      const { data: files } = await supabase.from('uploaded_files').select('file_name').eq('project_id', projectId).eq('category', 'business_plan').limit(1)
      if (files && files.length > 0) setUploadedFile(files[0].file_name)

      // Load saved extraction data from DB to reconstruct the view
      const [goalsRes, strategiesRes, measuresRes, bpDataRes] = await Promise.all([
        supabase.from('management_goals').select('*').eq('project_id', projectId).order('sort_order'),
        supabase.from('strategies').select('*').eq('project_id', projectId).order('sort_order'),
        supabase.from('measures').select('*').eq('project_id', projectId).order('sort_order'),
        supabase.from('business_plan_data').select('*').eq('project_id', projectId).single(),
      ])

      const goals = goalsRes.data
      const strategies = strategiesRes.data
      const measures = measuresRes.data || []
      const bpData = bpDataRes.data

      // Fetch links only if strategies exist (avoid 406 on empty filter)
      let links: Array<{ strategy_id: string; measure_id: string }> = []
      if (strategies && strategies.length > 0) {
        const stratIds = strategies.map((s: { id: string }) => s.id)
        const { data: linksData } = await supabase.from('strategy_measure_links').select('strategy_id, measure_id').in('strategy_id', stratIds)
        links = linksData || []
      }

      if ((goals && goals.length > 0) || (strategies && strategies.length > 0) || bpData) {
        // Reconstruct BusinessPlanExtraction from saved data
        const reconstruction: BusinessPlanExtraction = {
          fiscal_year: bpData?.fiscal_year || project?.fiscal_year,
          mission: bpData?.mission || undefined,
          vision: bpData?.vision || undefined,
          value_statement: bpData?.value_statement || undefined,
          business_policies: bpData?.business_policies as BusinessPlanExtraction['business_policies'] || undefined,
          management_goals: goals?.map((g: { type: string; title: string; description?: string; target_value?: string; target_unit?: string }) => ({
            type: g.type as 'qualitative' | 'quantitative',
            title: g.title,
            description: g.description,
            target_value: g.target_value,
            target_unit: g.target_unit,
          })) || undefined,
          strategies: strategies?.map((s: { id: string; title: string; description?: string; strategy_type?: string }) => {
            const linkedMeasureIds = links.filter((l: { strategy_id: string }) => l.strategy_id === s.id).map((l: { measure_id: string }) => l.measure_id)
            const linkedMeasures = measures.filter((m: { id: string }) => linkedMeasureIds.includes(m.id))
            return {
              title: s.title,
              description: s.description,
              strategy_type: (s.strategy_type || 'business') as 'business' | 'functional' | 'other',
              measures: linkedMeasures.map((m: { title: string; description?: string }) => ({
                title: m.title,
                description: m.description,
              })),
            }
          }) || undefined,
          financial_plan: bpData?.financial_plan as BusinessPlanExtraction['financial_plan'] || undefined,
          investment_plan: bpData?.investment_plan as BusinessPlanExtraction['investment_plan'] || undefined,
          personnel_plan: bpData?.personnel_plan as BusinessPlanExtraction['personnel_plan'] || undefined,
          schedule: bpData?.schedule as BusinessPlanExtraction['schedule'] || undefined,
        }
        setExtracted(reconstruction)
        setSaved(true)
      }
    }
    loadExisting()
  }, [projectId, supabase, project])

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const path = safeStoragePath(projectId, 'business_plan', file.name)
      const { error: uploadError } = await supabase.storage.from('project-files').upload(path, file, { upsert: true })
      if (uploadError) throw uploadError
      await supabase.from('uploaded_files').insert({ project_id: projectId, file_name: file.name, file_size: file.size, file_type: file.type, category: 'business_plan', storage_path: path })
      setUploadedFile(file.name)
      toast('アップロード完了。AIで抽出を開始します...', 'success')

      setExtracting(true)
      // Convert file to base64 directly (no Storage re-download needed)
      const pdfBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(file)
      })

      const aiData = await callAI('extract-business-plan', {
        system: EXTRACT_BUSINESS_PLAN_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: EXTRACT_BUSINESS_PLAN_USER_PROMPT() },
          ],
        }],
      })
      const result = parseAIJsonResponse(aiData) as BusinessPlanExtraction | null
      if (result) {
        setExtracted(result)
        const goalCount = result.management_goals?.length || 0
        const stratCount = result.strategies?.length || 0
        const measCount = result.strategies?.reduce((s, st) => s + (st.measures?.length || 0), 0) || 0
        toast(`${goalCount}件の目標、${stratCount}件の戦略、${measCount}件の施策を抽出しました`, 'success')
      }
    } catch (err) {
      console.error(err)
      toast('AI抽出に失敗しました。手動で登録してください。', 'error')
    } finally { setUploading(false); setExtracting(false) }
  }

  const handleSaveExtracted = async () => {
    if (!extracted) return
    try {
      const res = await fetch('/api/save-business-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, extracted }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setSaved(true)
      toast('抽出結果を保存しました', 'success')
    } catch (err) {
      console.error('Save error:', err)
      toast('保存に失敗しました: ' + (err instanceof Error ? err.message : ''), 'error')
    }
  }

  const fmt = (n: number | undefined) => n != null ? n.toLocaleString() : '-'

  return (
    <Card>
      <CardTitle>事業計画書アップロード</CardTitle>
      <p className="text-sm text-slate-500 mt-1 mb-6">事業計画書（PDF）をアップロードすると、AIが構造化データを抽出します</p>

      {!uploadedFile ? (
        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
          <svg className="w-12 h-12 text-slate-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
          <p className="text-sm text-slate-600 mb-4">PDFファイルをアップロードしてください</p>
          <label className="inline-block">
            <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
            <span className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-blue-700">
              {uploading ? 'アップロード中...' : 'ファイルを選択'}
            </span>
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            <span className="text-sm text-green-700">{uploadedFile} をアップロードしました</span>
          </div>

          {extracting && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
              <Spinner size="sm" /><span className="text-sm text-blue-700">AIが事業計画書を分析しています（1〜2分かかります）...</span>
            </div>
          )}

          {extracted && (
            <div className="space-y-4">
              {/* MVV */}
              {(extracted.mission || extracted.vision || extracted.value_statement) && (
                <div className="p-4 bg-slate-50 rounded-lg space-y-2">
                  <p className="text-sm font-semibold text-slate-800">Mission / Vision / Value</p>
                  {extracted.mission && <div><span className="text-xs font-medium text-blue-600">Mission:</span><p className="text-sm text-slate-700">{extracted.mission}</p></div>}
                  {extracted.vision && <div><span className="text-xs font-medium text-blue-600">Vision:</span><p className="text-sm text-slate-700">{extracted.vision}</p></div>}
                  {extracted.value_statement && <div><span className="text-xs font-medium text-blue-600">Value:</span><p className="text-sm text-slate-700">{extracted.value_statement}</p></div>}
                </div>
              )}

              {/* Business Policies */}
              {extracted.business_policies && extracted.business_policies.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm font-semibold text-slate-800 mb-2">経営方針</p>
                  {extracted.business_policies.map((p, i) => (
                    <div key={i} className="mb-1"><span className="text-xs font-medium text-slate-600">{p.title}:</span><span className="text-xs text-slate-500 ml-1">{p.description}</span></div>
                  ))}
                </div>
              )}

              {/* Management Goals */}
              {extracted.management_goals && extracted.management_goals.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm font-semibold text-slate-800 mb-2">経営目標 ({extracted.management_goals.length}件)</p>
                  {extracted.management_goals.map((g, i) => (
                    <div key={i} className="flex items-start gap-2 mb-1">
                      <Badge variant={g.type === 'quantitative' ? 'info' : 'success'}>{g.type === 'quantitative' ? '定量' : '定性'}</Badge>
                      <div><span className="text-xs text-slate-700">{g.title}</span>{g.target_value && <span className="text-xs text-blue-600 ml-1">({g.target_value}{g.target_unit})</span>}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Strategies & Measures (tree) */}
              {extracted.strategies && extracted.strategies.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm font-semibold text-slate-800 mb-2">戦略・施策 ({extracted.strategies.length}件)</p>
                  {extracted.strategies.map((s, i) => (
                    <div key={i} className="mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={s.strategy_type === 'functional' ? 'warning' : 'info'}>{s.strategy_type === 'functional' ? '機能別' : '事業'}</Badge>
                        <span className="text-xs font-medium text-slate-700">{s.title}</span>
                      </div>
                      {s.measures && s.measures.length > 0 && (
                        <div className="ml-6 mt-1 space-y-1">
                          {s.measures.map((m, j) => (
                            <div key={j} className="flex items-center gap-1 text-xs text-slate-600">
                              <span className="text-slate-400">└</span> {m.title}
                              {m.target_department && <Badge variant="default">{m.target_department}</Badge>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Financial Plan */}
              {extracted.financial_plan?.pl && extracted.financial_plan.pl.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-slate-800">財務計画（PL）</p>
                    {extracted.financial_plan.unit && <Badge variant="default">単位: {extracted.financial_plan.unit}</Badge>}
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="text-slate-500 border-b border-slate-200">
                      <th className="text-left py-1.5">項目</th>
                      <th className="text-right py-1.5">{extracted.financial_plan.previous_year_label || '前期実績'}</th>
                      <th className="text-right py-1.5">{extracted.financial_plan.plan_year_label || '今期計画'}</th>
                    </tr></thead>
                    <tbody>
                      {extracted.financial_plan.pl.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-1.5 text-slate-700">{r.item}</td>
                          <td className="text-right text-slate-600">{r.previous != null ? r.previous.toLocaleString() : '-'}</td>
                          <td className="text-right text-blue-600 font-medium">{r.plan != null ? r.plan.toLocaleString() : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Investment Plan */}
              {extracted.investment_plan && extracted.investment_plan.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-semibold text-slate-800">投資計画</p>
                    {extracted.investment_plan[0]?.unit && <Badge variant="default">単位: {extracted.investment_plan[0].unit}</Badge>}
                  </div>
                  <table className="w-full text-xs">
                    <thead><tr className="text-slate-500 border-b border-slate-200">
                      <th className="text-left py-1.5">投資項目</th>
                      <th className="text-left py-1.5">分類</th>
                      <th className="text-right py-1.5">金額</th>
                      <th className="text-left py-1.5">時期</th>
                      <th className="text-left py-1.5">内容</th>
                    </tr></thead>
                    <tbody>
                      {extracted.investment_plan.map((p, i) => (
                        <tr key={i} className="border-t border-slate-100">
                          <td className="py-1.5 text-slate-700 font-medium">{p.item || p.description?.split(':')[0] || '-'}</td>
                          <td className="py-1.5 text-slate-500">{p.category}</td>
                          <td className="py-1.5 text-right text-blue-600">{p.amount != null ? p.amount.toLocaleString() : '-'}</td>
                          <td className="py-1.5 text-slate-500">{p.schedule || '-'}</td>
                          <td className="py-1.5 text-slate-500 max-w-[200px] truncate">{p.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Personnel Plan */}
              {extracted.personnel_plan && extracted.personnel_plan.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm font-semibold text-slate-800 mb-2">人員計画</p>
                  <table className="w-full text-xs">
                    <thead><tr className="text-slate-500"><th className="text-left py-1">部門</th><th className="text-right">現在</th><th className="text-right">計画</th><th className="text-left pl-2">採用計画</th></tr></thead>
                    <tbody>
                      {extracted.personnel_plan.map((p, i) => (
                        <tr key={i} className="border-t border-slate-200"><td className="py-1 text-slate-700">{p.department}</td><td className="text-right">{p.current_count ?? '-'}</td><td className="text-right text-blue-600">{p.planned_count ?? '-'}</td><td className="pl-2 text-slate-500">{p.hiring_plan || '-'}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Schedule */}
              {extracted.schedule && extracted.schedule.length > 0 && (
                <div className="p-4 bg-slate-50 rounded-lg">
                  <p className="text-sm font-semibold text-slate-800 mb-2">スケジュール</p>
                  {extracted.schedule.map((s, i) => (
                    <div key={i} className="flex items-center gap-2 text-xs text-slate-600 mb-1">
                      <Badge variant="default">{s.target_date || '未定'}</Badge>
                      <span>{s.milestone}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3">
                <Button onClick={handleSaveExtracted} className="flex-1" disabled={saved}>{saved ? '保存済み' : '抽出結果を保存'}</Button>
                {saved && <Badge variant="success">保存完了</Badge>}
                {saved && (
                  <Button variant="danger" size="sm" onClick={async () => {
                    if (!confirm('抽出結果をクリアして再アップロードしますか？保存済みの経営目標・戦略・施策も削除されます。')) return
                    await Promise.all([
                      supabase.from('management_goals').delete().eq('project_id', projectId),
                      supabase.from('strategy_measure_links').delete().in('strategy_id',
                        (await supabase.from('strategies').select('id').eq('project_id', projectId)).data?.map((s: { id: string }) => s.id) || []
                      ),
                      supabase.from('measures').delete().eq('project_id', projectId),
                      supabase.from('strategies').delete().eq('project_id', projectId),
                      supabase.from('business_plan_data').delete().eq('project_id', projectId),
                    ])
                    setExtracted(null); setSaved(false); setUploadedFile(null)
                    toast('データをクリアしました。再アップロードしてください。', 'info')
                  }}>クリアして再アップロード</Button>
                )}
              </div>
            </div>
          )}
          {/* saved message integrated into button area */}
        </div>
      )}

      <div className="flex justify-between mt-6 pt-4 border-t border-slate-200">
        <Button variant="secondary" onClick={onBack}>戻る</Button>
        <Button onClick={onNext}>次へ</Button>
      </div>
    </Card>
  )
}

// ============================================================
// Step 3: Org Chart Upload + AI Extraction
// ============================================================
type DeptNode = { name: string; level: number; parent_name: string | null; sort_order: number; role_description?: string; responsibilities?: string[]; children?: DeptNode[] }

function buildTree(flat: DeptNode[]): DeptNode[] {
  const map: Record<string, DeptNode> = {}
  const roots: DeptNode[] = []
  for (const d of flat) { map[d.name] = { ...d, children: [] } }
  for (const d of flat) {
    const node = map[d.name]
    if (d.parent_name && map[d.parent_name]) {
      map[d.parent_name].children!.push(node)
    } else {
      roots.push(node)
    }
  }
  return roots
}

function OrgChartStep({ projectId, onNext, onBack, supabase, toast, refreshProject }: {
  projectId: string; onNext: () => void; onBack: () => void; supabase: ReturnType<typeof createClient>; toast: (msg: string, type?: 'success' | 'error' | 'info') => void; refreshProject: () => Promise<void>
}) {
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [departments, setDepartments] = useState<DeptNode[]>([])
  const [saved, setSaved] = useState(false)
  const [editingDept, setEditingDept] = useState<DeptNode | null>(null)
  const [showAddModal, setShowAddModal] = useState(false)
  const [respUploading, setRespUploading] = useState(false)

  // Load existing departments on mount
  useEffect(() => {
    const loadExisting = async () => {
      const { data } = await supabase.from('departments').select('*').eq('project_id', projectId).order('sort_order')
      if (data && data.length > 0) {
        // Convert DB records back to DeptNode format
        const nameMap: Record<string, string> = {}
        data.forEach((d: { id: string; name: string }) => { nameMap[d.id] = d.name })
        const nodes: DeptNode[] = data.map((d: { name: string; level: number; parent_id?: string; sort_order: number; role_description?: string; responsibilities?: string[] }) => ({
          name: d.name,
          level: d.level,
          parent_name: d.parent_id ? nameMap[d.parent_id] || null : null,
          sort_order: d.sort_order,
          role_description: d.role_description,
          responsibilities: d.responsibilities,
        }))
        setDepartments(nodes)
        setSaved(true)
      }
    }
    loadExisting()
  }, [projectId, supabase])

  const uploadAndExtract = async (file: File, category: string, endpoint: string, systemPrompt: string, userPrompt: string) => {
    const path = safeStoragePath(projectId, category, file.name)
    const { error: uploadError } = await supabase.storage.from('project-files').upload(path, file, { upsert: true })
    if (uploadError) throw uploadError
    await supabase.from('uploaded_files').insert({ project_id: projectId, file_name: file.name, file_size: file.size, file_type: file.type, category, storage_path: path })

    // Convert file to base64 directly (no Storage re-download)
    const pdfBase64 = await new Promise<string>((resolve) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve((reader.result as string).split(',')[1])
      reader.readAsDataURL(file)
    })

    return callAI(endpoint, {
      system: systemPrompt,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
        { type: 'text', text: userPrompt },
      ]}],
    })
  }

  const handleOrgChartUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true); setExtracting(true)
    try {
      toast('組織図をアップロード中...', 'info')
      const aiData = await uploadAndExtract(file, 'org_chart', 'extract-org-chart', EXTRACT_ORG_CHART_SYSTEM_PROMPT, EXTRACT_ORG_CHART_USER_PROMPT)
      const result = parseAIJsonResponse(aiData) as { departments?: DeptNode[] } | null
      if (result?.departments) {
        setDepartments(result.departments)
        toast(`${result.departments.length}件の部門を抽出しました`, 'success')
      }
    } catch (err) { console.error(err); toast('AI抽出に失敗しました', 'error') }
    finally { setUploading(false); setExtracting(false) }
  }

  const handleResponsibilitiesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || departments.length === 0) return
    setRespUploading(true)
    try {
      toast('業務分掌表をアップロード中...', 'info')
      const aiData = await uploadAndExtract(file, 'other', 'extract-responsibilities', EXTRACT_RESPONSIBILITIES_SYSTEM_PROMPT, EXTRACT_RESPONSIBILITIES_USER_PROMPT)
      const result = parseAIJsonResponse(aiData) as { departments?: Array<{ name: string; role_description?: string; responsibilities?: string[] }> } | null
      if (result?.departments) {
        setDepartments(prev => prev.map(d => {
          const match = result.departments!.find(r => r.name === d.name)
          return match ? { ...d, role_description: match.role_description, responsibilities: match.responsibilities } : d
        }))
        toast(`${result.departments.length}件の業務内容を紐付けました`, 'success')
      }
    } catch (err) { console.error(err); toast('業務分掌表の分析に失敗しました', 'error') }
    finally { setRespUploading(false) }
  }

  const handleDeleteDept = (name: string) => {
    setDepartments(prev => prev.filter(d => d.name !== name && d.parent_name !== name))
  }

  const handleUpdateDept = (oldName: string, updates: Partial<DeptNode>) => {
    setDepartments(prev => prev.map(d => d.name === oldName ? { ...d, ...updates } : d))
    setEditingDept(null)
  }

  const handleAddDept = (dept: DeptNode) => {
    setDepartments(prev => [...prev, dept])
    setShowAddModal(false)
  }

  const handleSaveDepartments = async () => {
    try {
      // Delete existing departments for this project first
      await supabase.from('departments').delete().eq('project_id', projectId)

      const parentMap: Record<string, string> = {}
      for (const dept of departments.sort((a, b) => a.level - b.level)) {
        const parentId = dept.parent_name ? parentMap[dept.parent_name] : null
        const { data } = await supabase.from('departments').insert({
          project_id: projectId, name: dept.name, level: dept.level,
          sort_order: dept.sort_order, parent_id: parentId || null,
          role_description: dept.role_description || null,
          responsibilities: dept.responsibilities || [],
        }).select('id').single()
        if (data) parentMap[dept.name] = data.id
      }
      setSaved(true)
      await refreshProject()
      toast('部門構造を保存しました', 'success')
    } catch (err) { console.error(err); toast('保存に失敗しました', 'error') }
  }

  const tree = buildTree(departments)

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>組織図アップロード</CardTitle>
        <p className="text-sm text-slate-500 mt-1 mb-4">組織図（PDF）をアップロードすると、AIが階層構造を抽出します</p>

        <div className="flex gap-3 flex-wrap">
          <label className="inline-block">
            <input type="file" accept=".pdf" onChange={handleOrgChartUpload} className="hidden" />
            <span className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-blue-700">
              {uploading ? '分析中...' : '組織図PDFをアップロード'}
            </span>
          </label>
          {departments.length > 0 && (
            <label className="inline-block">
              <input type="file" accept=".pdf" onChange={handleResponsibilitiesUpload} className="hidden" />
              <span className="inline-flex items-center px-4 py-2 bg-slate-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-slate-700">
                {respUploading ? '分析中...' : '業務分掌表PDFをアップロード'}
              </span>
            </label>
          )}
        </div>

        {extracting && <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg mt-4"><Spinner size="sm" /><span className="text-sm text-blue-700">AIが組織図を分析しています（1〜2分）...</span></div>}
        {respUploading && <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg mt-4"><Spinner size="sm" /><span className="text-sm text-blue-700">業務分掌表を分析しています...</span></div>}
      </Card>

      {departments.length > 0 && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>組織構造（{departments.length}部門）</CardTitle>
            <div className="flex gap-2">
              {saved && <Badge variant="success">保存済み</Badge>}
              <Button size="sm" variant="secondary" onClick={() => setShowAddModal(true)}>部門を追加</Button>
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden">
            {tree.map((node, i) => (
              <OrgTreeNode key={i} node={node} onEdit={setEditingDept} onDelete={handleDeleteDept} depth={0} />
            ))}
          </div>

          <div className="flex gap-3 mt-4">
            <Button onClick={handleSaveDepartments} className="flex-1">{saved ? '変更を保存' : '部門構造を保存'}</Button>
          </div>
        </Card>
      )}

      {/* saved message removed - badge shown in tree header instead */}

      {/* Edit Modal */}
      {editingDept && (
        <DeptEditModal dept={editingDept} allDepts={departments} onSave={(u) => handleUpdateDept(editingDept.name, u)} onClose={() => setEditingDept(null)} />
      )}

      {/* Add Modal */}
      {showAddModal && (
        <DeptAddModal allDepts={departments} onAdd={handleAddDept} onClose={() => setShowAddModal(false)} />
      )}

      <div className="flex justify-between pt-4 border-t border-slate-200">
        <Button variant="secondary" onClick={onBack}>戻る</Button>
        <Button onClick={onNext}>次へ</Button>
      </div>
    </div>
  )
}

function OrgTreeNode({ node, onEdit, onDelete, depth }: { node: DeptNode; onEdit: (d: DeptNode) => void; onDelete: (name: string) => void; depth: number }) {
  const [expanded, setExpanded] = useState(true)
  const hasChildren = node.children && node.children.length > 0
  const levelColors = ['bg-blue-50 border-blue-200', 'bg-slate-50 border-slate-200', 'bg-white border-slate-100', 'bg-white border-slate-50']

  return (
    <div>
      <div className={cn('flex items-start gap-2 px-3 py-2 border-b', levelColors[Math.min(depth, 3)])} style={{ paddingLeft: `${depth * 20 + 12}px` }}>
        {hasChildren ? (
          <button onClick={() => setExpanded(!expanded)} className="mt-0.5 text-slate-400 hover:text-slate-600 shrink-0">
            <svg className={cn('w-4 h-4 transition-transform', expanded && 'rotate-90')} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          </button>
        ) : <span className="w-4 shrink-0" />}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-slate-800">{node.name}</span>
            <Badge variant={node.level === 0 ? 'info' : node.level === 1 ? 'default' : 'default'}>
              {node.level === 0 ? '本部' : node.level === 1 ? '部' : node.level === 2 ? '課' : '係'}
            </Badge>
          </div>
          {node.role_description && <p className="text-xs text-slate-500 mt-0.5">{node.role_description}</p>}
          {node.responsibilities && node.responsibilities.length > 0 && (
            <div className="mt-1 flex gap-1 flex-wrap">
              {node.responsibilities.slice(0, 3).map((r, i) => <span key={i} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{r}</span>)}
              {node.responsibilities.length > 3 && <span className="text-[10px] text-slate-400">+{node.responsibilities.length - 3}</span>}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={() => onEdit(node)} className="text-slate-400 hover:text-blue-600 p-1" title="編集">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
          </button>
          <button onClick={() => { if (confirm(`「${node.name}」を削除しますか？`)) onDelete(node.name) }} className="text-slate-400 hover:text-red-600 p-1" title="削除">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
          </button>
        </div>
      </div>
      {expanded && hasChildren && node.children!.map((child, i) => (
        <OrgTreeNode key={i} node={child} onEdit={onEdit} onDelete={onDelete} depth={depth + 1} />
      ))}
    </div>
  )
}

function DeptEditModal({ dept, allDepts, onSave, onClose }: { dept: DeptNode; allDepts: DeptNode[]; onSave: (u: Partial<DeptNode>) => void; onClose: () => void }) {
  const [name, setName] = useState(dept.name)
  const [parentName, setParentName] = useState(dept.parent_name || '')
  const [roleDesc, setRoleDesc] = useState(dept.role_description || '')
  const [respText, setRespText] = useState((dept.responsibilities || []).join('\n'))

  return (
    <Modal open title={`${dept.name} を編集`} onClose={onClose}>
      <div className="space-y-4">
        <Input label="部門名" value={name} onChange={e => setName(e.target.value)} required />
        <Select label="上位部門" value={parentName} onChange={e => setParentName(e.target.value)}
          options={allDepts.filter(d => d.name !== dept.name).map(d => ({ value: d.name, label: d.name }))} placeholder="（最上位）" />
        <Textarea label="役割・ミッション" value={roleDesc} onChange={e => setRoleDesc(e.target.value)} rows={2} placeholder="この部門の役割を記載" />
        <Textarea label="業務内容（1行1項目）" value={respText} onChange={e => setRespText(e.target.value)} rows={5} placeholder="業務内容1&#10;業務内容2&#10;業務内容3" />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button onClick={() => onSave({
            name, parent_name: parentName || null, role_description: roleDesc || undefined,
            responsibilities: respText.split('\n').filter(s => s.trim()),
            level: parentName ? (allDepts.find(d => d.name === parentName)?.level ?? 0) + 1 : 0,
          })}>保存</Button>
        </div>
      </div>
    </Modal>
  )
}

function DeptAddModal({ allDepts, onAdd, onClose }: { allDepts: DeptNode[]; onAdd: (d: DeptNode) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [parentName, setParentName] = useState('')

  return (
    <Modal open title="部門を追加" onClose={onClose}>
      <div className="space-y-4">
        <Input label="部門名" value={name} onChange={e => setName(e.target.value)} required placeholder="例: 営業部" />
        <Select label="上位部門" value={parentName} onChange={e => setParentName(e.target.value)}
          options={allDepts.map(d => ({ value: d.name, label: d.name }))} placeholder="（最上位に追加）" />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button disabled={!name} onClick={() => onAdd({
            name, parent_name: parentName || null, sort_order: allDepts.length,
            level: parentName ? (allDepts.find(d => d.name === parentName)?.level ?? 0) + 1 : 0,
          })}>追加</Button>
        </div>
      </div>
    </Modal>
  )
}

// ============================================================
// Step 4: Strategy-Measure Linking with AI + Department assignment
// ============================================================
function StrategyLinkStep({ projectId, onNext, onBack, supabase, toast }: {
  projectId: string; onNext: () => void; onBack: () => void; supabase: ReturnType<typeof createClient>; toast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const { departments } = useProjectContext()
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [measures, setMeasures] = useState<Measure[]>([])
  const [links, setLinks] = useState<Array<{ strategy_id: string; measure_id: string }>>([])
  const [measureDepts, setMeasureDepts] = useState<Record<string, string[]>>({}) // measureId -> deptId[]
  const [loading, setLoading] = useState(true)
  const [autoLinking, setAutoLinking] = useState(false)
  const [hasLinked, setHasLinked] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      const [sRes, mRes] = await Promise.all([
        supabase.from('strategies').select('*').eq('project_id', projectId).order('sort_order'),
        supabase.from('measures').select('*').eq('project_id', projectId).order('sort_order'),
      ])
      if (sRes.data) setStrategies(sRes.data)
      if (mRes.data) setMeasures(mRes.data)
      if (sRes.data && sRes.data.length > 0) {
        const sIds = sRes.data.map((s: Strategy) => s.id)
        const { data: lData } = await supabase.from('strategy_measure_links').select('strategy_id, measure_id').in('strategy_id', sIds)
        if (lData && lData.length > 0) { setLinks(lData); setHasLinked(true); setSaved(true) }
      }
      // Restore measureDepts from department_id
      if (mRes.data) {
        const deptMap: Record<string, string[]> = {}
        mRes.data.forEach((m: Measure) => { if (m.department_id) deptMap[m.id] = [m.department_id] })
        setMeasureDepts(deptMap)
      }
      setLoading(false)
    }
    fetch()
  }, [projectId, supabase])

  const handleAutoLink = async () => {
    if (strategies.length === 0 || measures.length === 0) {
      toast('事業計画書をアップロードして戦略・施策を登録してください', 'error')
      return
    }
    setAutoLinking(true)
    try {
      // 部単位（level 1）の部門のみを候補にする
      const buDepts = departments.filter(d => d.level === 1)
      const deptNames = buDepts.map(d => d.name).join(', ')
      const stratStr = strategies.map((s, i) => `[${i}] ${s.title}: ${s.description || ''}`).join('\n')
      const measStr = measures.map((m, i) => `[${i}] ${m.title}: ${m.description || ''}`).join('\n')

      const aiData = await callAI('link-strategies', {
        system: `戦略と施策の紐付け、および施策の担当部門の割り当てを行ってください。

必ず以下のJSON形式で返してください:
{
  "links": [
    {"strategy_index": 0, "measure_index": 0, "departments": ["主担当部門名", "関連部門名"]}
  ]
}

注意:
- 各施策は最も関連する戦略1つに紐付けてください
- departmentsは以下の「部」単位の部門一覧から選んでください: ${deptNames || '(部門未登録)'}
- 施策の内容から関連する部門を最大3つまで割り振ってください
- 配列の先頭が主担当部門、2番目以降が関連部門です
- 最低1つは必ず割り振ってください`,
        messages: [{ role: 'user', content: `【戦略一覧】\n${stratStr}\n\n【施策一覧】\n${measStr}` }],
      })
      const result = parseAIJsonResponse(aiData) as { links?: Array<{ strategy_index: number; measure_index: number; departments?: string[] }> } | null
      if (result?.links) {
        // Clear existing links
        if (links.length > 0) {
          const existingStratIds = strategies.map(s => s.id)
          await supabase.from('strategy_measure_links').delete().in('strategy_id', existingStratIds)
          setLinks([])
        }

        // Build links and dept assignments in state (don't save to DB yet)
        const newLinks: Array<{ strategy_id: string; measure_id: string }> = []
        const newMeasureDepts: Record<string, string[]> = {}
        let count = 0
        for (const link of result.links) {
          const stratId = strategies[link.strategy_index]?.id
          const measId = measures[link.measure_index]?.id
          if (stratId && measId) {
            newLinks.push({ strategy_id: stratId, measure_id: measId })
            const deptIds: string[] = []
            if (link.departments) {
              for (const dName of link.departments.slice(0, 3)) {
                const dept = departments.find(d => d.name === dName)
                if (dept) deptIds.push(dept.id)
              }
            }
            if (deptIds.length > 0) newMeasureDepts[measId] = deptIds
            count++
          }
        }
        setLinks(newLinks)
        setMeasureDepts(newMeasureDepts)
        setHasLinked(true)
        setSaved(false)
        toast(`${count}件の紐付けを生成しました。「保存」ボタンで確定してください。`, 'success')
      }
    } catch { toast('AI分析に失敗しました', 'error') }
    finally { setAutoLinking(false) }
  }

  const handleToggleDepartment = (measureId: string, deptId: string) => {
    const current = measureDepts[measureId] || []
    let updated: string[]
    if (current.includes(deptId)) {
      updated = current.filter(id => id !== deptId)
    } else {
      if (current.length >= 3) { toast('部門は最大3つまでです', 'error'); return }
      updated = [...current, deptId]
    }
    setMeasureDepts(prev => ({ ...prev, [measureId]: updated }))
    setSaved(false)
  }

  const [saving, setSaving] = useState(false)

  const handleSaveLinks = async () => {
    setSaving(true)
    console.log('[Step4] Saving links:', links.length, 'measureDepts:', Object.keys(measureDepts).length)
    try {
      const res = await fetch('/api/save-strategy-links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, links, measureDepts }),
      })
      console.log('[Step4] Response status:', res.status)
      const data = await res.json()
      console.log('[Step4] Response data:', data)
      if (!res.ok) throw new Error(data.error || 'Save failed')
      setSaved(true)
      toast('戦略-施策紐付けを保存しました', 'success')
    } catch (err) {
      console.error('[Step4] Save error:', err)
      toast('保存に失敗しました: ' + (err instanceof Error ? err.message : String(err)), 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Card><div className="flex justify-center py-8"><Spinner size="lg" /></div></Card>

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div>
            <CardTitle>戦略-施策紐付け</CardTitle>
            <p className="text-sm text-slate-500 mt-1">AIが戦略・施策の紐付けと担当部門の割り当てを行います</p>
          </div>
        </div>

        {strategies.length === 0 ? (
          <div className="py-8 text-center text-sm text-slate-500">事業計画書をアップロードすると、戦略と施策が登録されます。</div>
        ) : !hasLinked ? (
          <div className="py-8 text-center">
            <p className="text-sm text-slate-600 mb-4">AIが戦略と施策の関連性を分析し、担当部門を提案します</p>
            <Button onClick={handleAutoLink} loading={autoLinking}>
              {autoLinking ? 'AI分析中...' : 'AI分析を実行'}
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="secondary" onClick={handleAutoLink} loading={autoLinking}>AI再分析</Button>
              <Button size="sm" onClick={handleSaveLinks} loading={saving} disabled={saved}>
                {saved ? '保存済み' : '保存'}
              </Button>
            </div>
            {strategies.map(s => {
              const linkedMeasures = measures.filter(m => links.some(l => l.strategy_id === s.id && l.measure_id === m.id))
              return (
                <div key={s.id} className="p-4 border border-slate-200 rounded-lg">
                  <div className="flex items-center gap-2 mb-3">
                    <Badge variant={(s as Strategy & { strategy_type?: string }).strategy_type === 'functional' ? 'warning' : 'info'}>
                      {(s as Strategy & { strategy_type?: string }).strategy_type === 'functional' ? '機能別戦略' : '事業戦略'}
                    </Badge>
                    <span className="text-sm font-medium text-slate-900">{s.title}</span>
                  </div>
                  {linkedMeasures.length === 0 ? (
                    <p className="text-xs text-slate-400 ml-2">紐付いた施策なし</p>
                  ) : (
                    <div className="space-y-2 ml-2">
                      {linkedMeasures.map(m => {
                        const deptIds = measureDepts[m.id] || []
                        const buDepts = departments.filter(d => d.level === 1)
                        return (
                          <div key={m.id} className="bg-slate-50 rounded-lg px-3 py-2">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-400 shrink-0">└</span>
                              <span className="text-sm text-slate-700 flex-1 min-w-0">{m.title}</span>
                            </div>
                            <div className="flex gap-1.5 mt-1.5 ml-5 flex-wrap">
                              {buDepts.map(d => {
                                const selected = deptIds.includes(d.id)
                                const isPrimary = deptIds[0] === d.id
                                return (
                                  <button
                                    key={d.id}
                                    onClick={() => handleToggleDepartment(m.id, d.id)}
                                    className={cn(
                                      'text-[11px] px-2 py-0.5 rounded-full border transition-colors',
                                      selected
                                        ? isPrimary
                                          ? 'bg-blue-600 text-white border-blue-600'
                                          : 'bg-blue-100 text-blue-700 border-blue-300'
                                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                    )}
                                  >
                                    {d.name}{isPrimary ? '（主）' : ''}
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <div className="flex justify-between pt-4 border-t border-slate-200">
        <Button variant="secondary" onClick={onBack}>戻る</Button>
        <Button onClick={onNext}>次へ</Button>
      </div>
    </div>
  )
}

// ============================================================
// Step 5: Invite Members
// ============================================================
type InviteeRow = { name: string; email: string; department: string; position: string; role: string; status: 'pending' | 'sending' | 'sent' | 'accepted' | 'error' }

const ROLE_OPTIONS = [
  { value: 'department_manager', label: '一般' },
  { value: 'company_admin', label: '管理部門' },
  { value: 'executive', label: '経営層' },
]

function InviteMembersStep({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const { departments } = useProjectContext()
  const [invitees, setInvitees] = useState<InviteeRow[]>([])
  const [sending, setSending] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()

  // Load existing invitations on mount
  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase.from('invitations').select('*').eq('project_id', projectId)
      if (error) { console.warn('invitations load error (RLS):', error.message); return }
      if (data && data.length > 0) {
        setInvitees(data.map((inv: { email: string; role: string; status: string; department_id?: string }) => ({
          name: '', email: inv.email, department: departments.find(d => d.id === inv.department_id)?.name || '', position: '',
          role: inv.role, status: inv.status === 'accepted' ? 'accepted' as const : 'sent' as const,
        })))
      }
    }
    load()
  }, [projectId, supabase, departments])

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    console.log('[Step5] Excel file selected:', file.name, file.size, 'bytes')
    try {
      const XLSX = await import('xlsx')
      console.log('[Step5] XLSX loaded, version:', XLSX.version)
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data)
      console.log('[Step5] Sheets:', wb.SheetNames)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, string>>(ws)
      console.log('[Step5] Parsed rows:', rows.length, 'First row keys:', rows[0] ? Object.keys(rows[0]) : 'empty')

      // Flexible column matching by partial keyword search
      const findCol = (row: Record<string, string>, keywords: string[]): string => {
        for (const key of Object.keys(row)) {
          const k = key.toLowerCase()
          if (keywords.some(kw => k.includes(kw))) return String(row[key] || '').trim()
        }
        return ''
      }

      const parsed: InviteeRow[] = rows.map(row => ({
        department: findCol(row, ['部署', '部門', 'department', 'dept']),
        position: findCol(row, ['役職', '職位', '肩書', 'position', 'title']),
        name: findCol(row, ['氏名', '名前', '社員名', 'name']),
        email: findCol(row, ['メール', 'email', 'mail', 'e-mail']),
        role: 'department_manager',
        status: 'pending' as const,
      })).filter(r => r.email && r.email.includes('@'))

      setInvitees(prev => {
        const existingEmails = new Set(prev.map(i => i.email))
        const newOnes = parsed.filter(p => !existingEmails.has(p.email))
        return [...prev, ...newOnes]
      })
      toast(`${parsed.length}件の従業員を読み込みました`, 'success')
    } catch { toast('Excelの読み込みに失敗しました', 'error') }
  }

  const handleChangeRole = (email: string, role: string) => {
    setInvitees(prev => prev.map(i => i.email === email ? { ...i, role } : i))
  }

  const handleRemove = (email: string) => {
    setInvitees(prev => prev.filter(i => i.email !== email))
  }

  const handleAddManual = (row: InviteeRow) => {
    if (invitees.some(i => i.email === row.email)) { toast('このメールアドレスは既に追加されています', 'error'); return }
    setInvitees(prev => [...prev, row])
    setShowAddModal(false)
  }

  const handleSendAll = async () => {
    const unsent = invitees.filter(i => i.status === 'pending')
    if (unsent.length === 0) { toast('送信対象がありません', 'info'); return }
    setSending(true)
    let successCount = 0
    for (const inv of unsent) {
      setInvitees(prev => prev.map(i => i.email === inv.email ? { ...i, status: 'sending' } : i))
      try {
        const deptId = departments.find(d => d.name === inv.department)?.id
        const res = await fetch('/api/invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, email: inv.email, role: inv.role, departmentId: deptId }),
        })
        if (!res.ok) throw new Error()
        setInvitees(prev => prev.map(i => i.email === inv.email ? { ...i, status: 'sent' } : i))
        successCount++
      } catch {
        setInvitees(prev => prev.map(i => i.email === inv.email ? { ...i, status: 'error' } : i))
      }
    }
    setSending(false)
    toast(`${successCount}件の招待を送信しました`, 'success')
  }

  const statusLabel = (s: string) => ({ pending: '未送信', sending: '送信中...', sent: '送信済み', accepted: '承認済み', error: 'エラー' }[s] || s)
  const statusVariant = (s: string) => ({ pending: 'default', sending: 'info', sent: 'info', accepted: 'success', error: 'danger' }[s] || 'default') as 'default' | 'info' | 'success' | 'danger'

  const pendingCount = invitees.filter(i => i.status === 'pending').length

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>メンバー招待</CardTitle>
        <p className="text-sm text-slate-500 mt-1 mb-4">従業員リスト（Excel）をアップロードするか、手動で追加してください</p>

        <div className="flex gap-3 flex-wrap">
          <label className="inline-block">
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-blue-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              Excelアップロード
            </span>
          </label>
          <Button variant="secondary" onClick={() => setShowAddModal(true)}>手動で追加</Button>
        </div>
        <p className="text-xs text-slate-400 mt-2">Excel列: 部署（部署名/部門）、氏名（氏名/名前）、メールアドレス（メール/email）</p>
      </Card>

      {invitees.length > 0 && (
        <Card padding={false}>
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-semibold text-slate-800">招待リスト（{invitees.length}名）</p>
            <div className="flex gap-2">
              {pendingCount > 0 && (
                <Button size="sm" onClick={handleSendAll} loading={sending}>
                  {pendingCount}件の招待を一括送信
                </Button>
              )}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-xs text-slate-500">
                <th className="text-left px-4 py-2">氏名</th>
                <th className="text-left px-4 py-2">メールアドレス</th>
                <th className="text-left px-4 py-2">部署</th>
                <th className="text-left px-4 py-2">役職</th>
                <th className="text-left px-4 py-2">権限</th>
                <th className="text-left px-4 py-2">ステータス</th>
                <th className="w-10"></th>
              </tr>
            </thead>
            <tbody>
              {invitees.map((inv, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-2 text-slate-700">{inv.name || '-'}</td>
                  <td className="px-4 py-2 text-slate-600">{inv.email}</td>
                  <td className="px-4 py-2 text-slate-600">{inv.department || '-'}</td>
                  <td className="px-4 py-2 text-slate-600">{inv.position || '-'}</td>
                  <td className="px-4 py-2">
                    <select
                      value={inv.role}
                      onChange={e => handleChangeRole(inv.email, e.target.value)}
                      disabled={inv.status === 'sent' || inv.status === 'accepted'}
                      className="text-xs border border-slate-200 rounded px-2 py-1 bg-white"
                    >
                      {ROLE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <Badge variant={statusVariant(inv.status)}>{statusLabel(inv.status)}</Badge>
                  </td>
                  <td className="px-2 py-2">
                    <button onClick={() => handleRemove(inv.email)} className="text-slate-300 hover:text-red-500 p-1" title="削除">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {showAddModal && (
        <ManualAddModal departments={departments} onAdd={handleAddManual} onClose={() => setShowAddModal(false)} />
      )}

      <div className="flex justify-between pt-4 border-t border-slate-200">
        <Button variant="secondary" onClick={onBack}>戻る</Button>
        <Button onClick={() => window.location.href = `/projects/${projectId}/dashboard`}>設定完了</Button>
      </div>
    </div>
  )
}

function ManualAddModal({ departments, onAdd, onClose }: { departments: Department[]; onAdd: (r: InviteeRow) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [department, setDepartment] = useState('')
  const [position, setPosition] = useState('')
  const [role, setRole] = useState('department_manager')

  return (
    <Modal open title="メンバーを手動追加" onClose={onClose}>
      <div className="space-y-4">
        <Input label="氏名" value={name} onChange={e => setName(e.target.value)} placeholder="山田 太郎" />
        <Input label="メールアドレス" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@company.co.jp" required />
        <Select label="部署" value={department} onChange={e => setDepartment(e.target.value)}
          options={departments.filter(d => d.level === 1).map(d => ({ value: d.name, label: d.name }))} placeholder="部署を選択" />
        <Input label="役職" value={position} onChange={e => setPosition(e.target.value)} placeholder="部長、課長 等" />
        <Select label="権限" value={role} onChange={e => setRole(e.target.value)} options={ROLE_OPTIONS} />
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button disabled={!email} onClick={() => onAdd({ name, email, department, position, role, status: 'pending' })}>追加</Button>
        </div>
      </div>
    </Modal>
  )
}
