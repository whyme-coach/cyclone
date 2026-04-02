'use client'

import { useState, useEffect } from 'react'
import { useProjectContext } from '../layout'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { callAI, parseAIJsonResponse } from '@/lib/ai/helpers'
import { INDUSTRIES, SETUP_STEPS } from '@/lib/constants'
import { EXTRACT_BUSINESS_PLAN_SYSTEM_PROMPT, EXTRACT_BUSINESS_PLAN_USER_PROMPT } from '@/lib/ai/prompts/extract-business-plan'
import { EXTRACT_ORG_CHART_SYSTEM_PROMPT, EXTRACT_ORG_CHART_USER_PROMPT } from '@/lib/ai/prompts/extract-org-chart'
import { cn } from '@/lib/utils'
import type { Company, ManagementGoal, Strategy, Measure, Department } from '@/types'

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
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [extracted, setExtracted] = useState<{ goals: ManagementGoal[]; strategies: Strategy[]; measures: Array<{ title: string; description?: string; related_strategy_index: number }> } | null>(null)
  const [saved, setSaved] = useState(false)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const path = `${projectId}/business_plan/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage.from('project-files').upload(path, file)
      if (uploadError) throw uploadError
      await supabase.from('uploaded_files').insert({ project_id: projectId, file_name: file.name, file_size: file.size, file_type: file.type, category: 'business_plan', storage_path: path })
      setUploadedFile(file.name)
      toast('アップロード完了。AIで抽出を開始します...', 'success')

      // Trigger AI extraction
      setExtracting(true)
      const { data: urlData } = await supabase.storage.from('project-files').createSignedUrl(path, 600)
      if (!urlData?.signedUrl) throw new Error('URL取得失敗')

      const pdfRes = await fetch(urlData.signedUrl)
      const pdfBlob = await pdfRes.blob()
      const pdfBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(pdfBlob)
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
      const result = parseAIJsonResponse(aiData) as { management_goals?: Array<{ type: string; title: string; description?: string; target_value?: string; target_unit?: string }>; strategies?: Array<{ title: string; description?: string }>; measures?: Array<{ title: string; description?: string; related_strategy_index: number }> } | null
      if (result) {
        setExtracted({
          goals: (result.management_goals || []) as unknown as ManagementGoal[],
          strategies: (result.strategies || []) as unknown as Strategy[],
          measures: result.measures || [],
        })
        toast(`${(result.management_goals || []).length}件の目標、${(result.strategies || []).length}件の戦略、${(result.measures || []).length}件の施策を抽出しました`, 'success')
      }
    } catch (err) {
      console.error(err)
      toast('AI抽出に失敗しました。手動で登録してください。', 'error')
    } finally { setUploading(false); setExtracting(false) }
  }

  const handleSaveExtracted = async () => {
    if (!extracted) return
    try {
      // Save goals
      for (const [i, g] of extracted.goals.entries()) {
        await supabase.from('management_goals').insert({ project_id: projectId, type: (g as unknown as Record<string, string>).type || 'quantitative', title: (g as unknown as Record<string, string>).title, description: (g as unknown as Record<string, string>).description || '', target_value: (g as unknown as Record<string, string>).target_value || '', target_unit: (g as unknown as Record<string, string>).target_unit || '', sort_order: i })
      }
      // Save strategies
      const strategyIds: string[] = []
      for (const [i, s] of extracted.strategies.entries()) {
        const { data } = await supabase.from('strategies').insert({ project_id: projectId, title: (s as unknown as Record<string, string>).title, description: (s as unknown as Record<string, string>).description || '', sort_order: i }).select('id').single()
        strategyIds.push(data?.id || '')
      }
      // Save measures with strategy links
      for (const [i, m] of extracted.measures.entries()) {
        const { data } = await supabase.from('measures').insert({ project_id: projectId, title: m.title, description: m.description || '', sort_order: i }).select('id').single()
        if (data && m.related_strategy_index >= 0 && m.related_strategy_index < strategyIds.length) {
          await supabase.from('strategy_measure_links').insert({ strategy_id: strategyIds[m.related_strategy_index], measure_id: data.id, linked_by: 'ai' })
        }
      }
      setSaved(true)
      toast('抽出結果を保存しました', 'success')
    } catch { toast('保存に失敗しました', 'error') }
  }

  return (
    <Card>
      <CardTitle>事業計画書アップロード</CardTitle>
      <p className="text-sm text-slate-500 mt-1 mb-6">事業計画書（PDF）をアップロードすると、AIが経営目標・戦略・施策を抽出します</p>

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
              <Spinner size="sm" /><span className="text-sm text-blue-700">AIが事業計画書を分析しています...</span>
            </div>
          )}

          {extracted && !saved && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">抽出結果:</p>
              <div className="grid gap-2">
                <div className="p-3 bg-slate-50 rounded-lg">
                  <Badge variant="info">経営目標 {extracted.goals.length}件</Badge>
                  {extracted.goals.map((g, i) => <p key={i} className="text-xs text-slate-600 mt-1">・{(g as unknown as Record<string, string>).title}</p>)}
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <Badge variant="info">戦略 {extracted.strategies.length}件</Badge>
                  {extracted.strategies.map((s, i) => <p key={i} className="text-xs text-slate-600 mt-1">・{(s as unknown as Record<string, string>).title}</p>)}
                </div>
                <div className="p-3 bg-slate-50 rounded-lg">
                  <Badge variant="info">施策 {extracted.measures.length}件</Badge>
                  {extracted.measures.map((m, i) => <p key={i} className="text-xs text-slate-600 mt-1">・{m.title}</p>)}
                </div>
              </div>
              <Button onClick={handleSaveExtracted}>抽出結果を保存</Button>
            </div>
          )}
          {saved && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">保存完了。経営目標・戦略ページで編集できます。</div>}
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
function OrgChartStep({ projectId, onNext, onBack, supabase, toast, refreshProject }: {
  projectId: string; onNext: () => void; onBack: () => void; supabase: ReturnType<typeof createClient>; toast: (msg: string, type?: 'success' | 'error' | 'info') => void; refreshProject: () => Promise<void>
}) {
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<string | null>(null)
  const [departments, setDepartments] = useState<Array<{ name: string; level: number; parent_name: string | null; sort_order: number }>>([])
  const [saved, setSaved] = useState(false)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const path = `${projectId}/org_chart/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage.from('project-files').upload(path, file)
      if (uploadError) throw uploadError
      await supabase.from('uploaded_files').insert({ project_id: projectId, file_name: file.name, file_size: file.size, file_type: file.type, category: 'org_chart', storage_path: path })
      setUploadedFile(file.name)
      toast('アップロード完了。AIで抽出を開始します...', 'success')

      setExtracting(true)
      const { data: urlData } = await supabase.storage.from('project-files').createSignedUrl(path, 600)
      if (!urlData?.signedUrl) throw new Error('URL取得失敗')

      const pdfRes = await fetch(urlData.signedUrl)
      const pdfBlob = await pdfRes.blob()
      const pdfBase64 = await new Promise<string>((resolve) => {
        const reader = new FileReader()
        reader.onloadend = () => resolve((reader.result as string).split(',')[1])
        reader.readAsDataURL(pdfBlob)
      })

      const aiData = await callAI('extract-org-chart', {
        system: EXTRACT_ORG_CHART_SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdfBase64 } },
            { type: 'text', text: EXTRACT_ORG_CHART_USER_PROMPT },
          ],
        }],
      })
      const result = parseAIJsonResponse(aiData) as { departments?: Array<{ name: string; level: number; parent_name: string | null; sort_order: number }> } | null
      if (result?.departments) {
        setDepartments(result.departments)
        toast(`${result.departments.length}件の部門を抽出しました`, 'success')
      }
    } catch (err) {
      console.error(err)
      toast('AI抽出に失敗しました', 'error')
    } finally { setUploading(false); setExtracting(false) }
  }

  const handleSaveDepartments = async () => {
    try {
      const parentMap: Record<string, string> = {}
      for (const dept of departments.sort((a, b) => a.level - b.level)) {
        const parentId = dept.parent_name ? parentMap[dept.parent_name] : null
        const { data } = await supabase.from('departments').insert({ project_id: projectId, name: dept.name, level: dept.level, sort_order: dept.sort_order, parent_id: parentId || null }).select('id').single()
        if (data) parentMap[dept.name] = data.id
      }
      setSaved(true)
      await refreshProject()
      toast('部門構造を保存しました', 'success')
    } catch { toast('保存に失敗しました', 'error') }
  }

  return (
    <Card>
      <CardTitle>組織図アップロード</CardTitle>
      <p className="text-sm text-slate-500 mt-1 mb-6">組織図（PDF）をアップロードすると、AIが組織構造を抽出します</p>

      {!uploadedFile ? (
        <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
          <svg className="w-12 h-12 text-slate-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
          <p className="text-sm text-slate-600 mb-4">組織図PDFをアップロードしてください</p>
          <label className="inline-block">
            <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
            <span className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-blue-700">{uploading ? 'アップロード中...' : 'ファイルを選択'}</span>
          </label>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
            <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            <span className="text-sm text-green-700">{uploadedFile} をアップロードしました</span>
          </div>
          {extracting && <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg"><Spinner size="sm" /><span className="text-sm text-blue-700">AIが組織図を分析しています...</span></div>}
          {departments.length > 0 && !saved && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-700">抽出された部門:</p>
              <div className="space-y-1">
                {departments.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 rounded" style={{ paddingLeft: `${d.level * 24 + 8}px` }}>
                    <span className="text-sm text-slate-700">{d.name}</span>
                    <Badge variant="default">Lv.{d.level}</Badge>
                  </div>
                ))}
              </div>
              <Button onClick={handleSaveDepartments}>部門構造を保存</Button>
            </div>
          )}
          {saved && <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">部門構造を保存しました。</div>}
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
// Step 4: Strategy-Measure Linking with AI
// ============================================================
function StrategyLinkStep({ projectId, onNext, onBack, supabase, toast }: {
  projectId: string; onNext: () => void; onBack: () => void; supabase: ReturnType<typeof createClient>; toast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [measures, setMeasures] = useState<Measure[]>([])
  const [links, setLinks] = useState<Array<{ strategy_id: string; measure_id: string }>>([])
  const [loading, setLoading] = useState(true)
  const [autoLinking, setAutoLinking] = useState(false)

  useEffect(() => {
    const fetch = async () => {
      const [sRes, mRes, lRes] = await Promise.all([
        supabase.from('strategies').select('*').eq('project_id', projectId).order('sort_order'),
        supabase.from('measures').select('*').eq('project_id', projectId).order('sort_order'),
        supabase.from('strategy_measure_links').select('strategy_id, measure_id'),
      ])
      if (sRes.data) setStrategies(sRes.data)
      if (mRes.data) setMeasures(mRes.data)
      if (lRes.data) {
        const sIds = new Set((sRes.data || []).map((s: Strategy) => s.id))
        setLinks(lRes.data.filter((l: { strategy_id: string; measure_id: string }) => sIds.has(l.strategy_id)))
      }
      setLoading(false)
    }
    fetch()
  }, [projectId, supabase])

  const handleAutoLink = async () => {
    if (strategies.length === 0 || measures.length === 0) {
      toast('戦略と施策を先に登録してください', 'error')
      return
    }
    setAutoLinking(true)
    try {
      const stratStr = strategies.map((s, i) => `[${i}] ${s.title}`).join('\n')
      const measStr = measures.map((m, i) => `[${i}] ${m.title}`).join('\n')
      const aiData = await callAI('link-strategies', {
        system: '戦略と施策の紐付けを行ってください。各施策が最も関連する戦略のインデックスを指定してください。\n\n必ず以下のJSON形式で返してください:\n{"links": [{"strategy_index": 0, "measure_index": 0}]}',
        messages: [{ role: 'user', content: `【戦略一覧】\n${stratStr}\n\n【施策一覧】\n${measStr}` }],
      })
      const result = parseAIJsonResponse(aiData) as { links?: Array<{ strategy_index: number; measure_index: number }> } | null
      if (result?.links) {
        let count = 0
        for (const link of result.links) {
          const stratId = strategies[link.strategy_index]?.id
          const measId = measures[link.measure_index]?.id
          if (stratId && measId) {
            const existing = links.find(l => l.strategy_id === stratId && l.measure_id === measId)
            if (!existing) {
              await supabase.from('strategy_measure_links').insert({ strategy_id: stratId, measure_id: measId, linked_by: 'ai' })
              setLinks(prev => [...prev, { strategy_id: stratId, measure_id: measId }])
              count++
            }
          }
        }
        toast(`${count}件の紐付けを追加しました`, 'success')
      }
    } catch { toast('AI紐付けに失敗しました', 'error') }
    finally { setAutoLinking(false) }
  }

  if (loading) return <Card><div className="flex justify-center py-8"><Spinner size="lg" /></div></Card>

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div>
          <CardTitle>戦略-施策紐付け</CardTitle>
          <p className="text-sm text-slate-500 mt-1">AIが戦略と施策を自動的に紐付けます</p>
        </div>
        {strategies.length > 0 && measures.length > 0 && (
          <Button onClick={handleAutoLink} loading={autoLinking} variant="secondary">AI自動紐付け</Button>
        )}
      </div>

      {strategies.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">事業計画書をアップロードすると、戦略と施策が登録されます。</div>
      ) : (
        <div className="space-y-4">
          {strategies.map(s => {
            const linkedMeasures = measures.filter(m => links.some(l => l.strategy_id === s.id && l.measure_id === m.id))
            return (
              <div key={s.id} className="p-4 border border-slate-200 rounded-lg">
                <p className="text-sm font-medium text-slate-900"><Badge variant="info">戦略</Badge> {s.title}</p>
                <div className="mt-2 space-y-1">
                  {linkedMeasures.length === 0 ? (
                    <p className="text-xs text-slate-400">紐付いた施策なし</p>
                  ) : (
                    linkedMeasures.map(m => (
                      <div key={m.id} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 rounded px-2 py-1">
                        <span>→ {m.title}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )
          })}
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
// Step 5: Invite Members
// ============================================================
function InviteMembersStep({ projectId, onBack }: { projectId: string; onBack: () => void }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('company_admin')
  const [loading, setLoading] = useState(false)
  const [invitedList, setInvitedList] = useState<string[]>([])
  const { toast } = useToast()

  const handleInvite = async () => {
    if (!email) return
    setLoading(true)
    try {
      const res = await fetch('/api/invite', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, email, role }) })
      if (!res.ok) throw new Error()
      toast(`${email} を招待しました`, 'success')
      setInvitedList(prev => [...prev, email])
      setEmail('')
    } catch { toast('招待に失敗しました', 'error') }
    finally { setLoading(false) }
  }

  return (
    <Card>
      <CardTitle>メンバー招待</CardTitle>
      <p className="text-sm text-slate-500 mt-1 mb-6">事業会社の管理者やメンバーを招待します</p>

      <div className="flex gap-3">
        <div className="flex-1"><Input label="メールアドレス" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="user@company.co.jp" /></div>
        <div className="w-48">
          <Select label="権限" value={role} onChange={e => setRole(e.target.value)} options={[
            { value: 'company_admin', label: '管理部門' },
            { value: 'department_manager', label: '部門責任者' },
            { value: 'executive', label: '経営層' },
          ]} />
        </div>
        <div className="pt-6"><Button onClick={handleInvite} loading={loading}>招待</Button></div>
      </div>

      {invitedList.length > 0 && (
        <div className="mt-4 space-y-1">
          {invitedList.map((e, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-green-700">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              {e}
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-between mt-6 pt-4 border-t border-slate-200">
        <Button variant="secondary" onClick={onBack}>戻る</Button>
        <Button variant="secondary" onClick={() => window.location.href = `/projects/${projectId}/dashboard`}>設定完了</Button>
      </div>
    </Card>
  )
}
