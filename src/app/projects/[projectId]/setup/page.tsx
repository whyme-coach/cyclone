'use client'

import { useState } from 'react'
import { useProjectContext } from '../layout'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { callAI, parseAIJsonResponse } from '@/lib/ai/helpers'
import { INDUSTRIES, SETUP_STEPS } from '@/lib/constants'
import { cn } from '@/lib/utils'
import type { Company } from '@/types'

export default function SetupPage() {
  const { project, company, refreshProject } = useProjectContext()
  const [currentStep, setCurrentStep] = useState(project?.current_setup_step || 1)
  const { toast } = useToast()
  const supabase = createClient()

  if (!project || !company) return <Spinner size="lg" />

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">初期設定</h2>
        <p className="text-sm text-slate-500 mt-1">事業計画の実行支援に必要な情報を設定します</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
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

      {/* Step content */}
      {currentStep === 1 && (
        <CompanyInfoStep
          company={company}
          projectId={project.id}
          onNext={() => setCurrentStep(2)}
          supabase={supabase}
          toast={toast}
        />
      )}
      {currentStep === 2 && (
        <BusinessPlanStep
          projectId={project.id}
          onNext={() => setCurrentStep(3)}
          onBack={() => setCurrentStep(1)}
          supabase={supabase}
          toast={toast}
        />
      )}
      {currentStep === 3 && (
        <OrgChartStep
          projectId={project.id}
          onNext={() => setCurrentStep(4)}
          onBack={() => setCurrentStep(2)}
          supabase={supabase}
          toast={toast}
          refreshProject={refreshProject}
        />
      )}
      {currentStep === 4 && (
        <StrategyLinkStep
          projectId={project.id}
          onNext={() => setCurrentStep(5)}
          onBack={() => setCurrentStep(3)}
        />
      )}
      {currentStep === 5 && (
        <InviteMembersStep
          projectId={project.id}
          onBack={() => setCurrentStep(4)}
        />
      )}
    </div>
  )
}

// ============================================================
// Step 1: Company Info
// ============================================================

function CompanyInfoStep({
  company, projectId, onNext, supabase, toast,
}: {
  company: Company
  projectId: string
  onNext: () => void
  supabase: ReturnType<typeof createClient>
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [url, setUrl] = useState(company.website || '')
  const [scraping, setScraping] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: company.name || '',
    name_kana: company.name_kana || '',
    address: company.address || '',
    established_date: company.established_date || '',
    capital: company.capital?.toString() || '',
    industry: company.industry || '',
    business_description: company.business_description || '',
    employee_count: company.employee_count || '',
    representative: company.representative || '',
    phone: company.phone || '',
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
        setForm(prev => ({
          ...prev,
          ...(r.name && { name: r.name }),
          ...(r.name_kana && { name_kana: r.name_kana }),
          ...(r.address && { address: r.address }),
          ...(r.established_date && { established_date: r.established_date }),
          ...(r.capital && { capital: r.capital }),
          ...(r.industry && { industry: r.industry }),
          ...(r.business_description && { business_description: r.business_description }),
          ...(r.employee_count && { employee_count: r.employee_count }),
          ...(r.representative && { representative: r.representative }),
          ...(r.phone && { phone: r.phone }),
        }))
        toast('企業情報を取得しました', 'success')
      }
    } catch {
      toast('企業情報の取得に失敗しました', 'error')
    } finally {
      setScraping(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await supabase.from('companies').update({
        ...form,
        website: url,
        capital: form.capital ? parseInt(form.capital.replace(/,/g, '')) : null,
      }).eq('id', company.id)
      toast('保存しました', 'success')
      onNext()
    } catch {
      toast('保存に失敗しました', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card>
      <CardTitle>会社基本情報</CardTitle>
      <p className="text-sm text-slate-500 mt-1 mb-6">会社URLを入力してAIが企業情報を取得します</p>

      <div className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1">
            <Input
              label="会社URL"
              value={url}
              onChange={e => setUrl(e.target.value)}
              placeholder="https://www.example.co.jp"
            />
          </div>
          <div className="pt-6">
            <Button onClick={handleScrape} loading={scraping} variant="secondary">
              AI取得
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Input label="商号" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required />
          <Input label="商号（フリガナ）" value={form.name_kana} onChange={e => setForm({ ...form, name_kana: e.target.value })} />
        </div>
        <Input label="本店所在地" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
        <div className="grid grid-cols-3 gap-4">
          <Input label="設立年月日" value={form.established_date} onChange={e => setForm({ ...form, established_date: e.target.value })} />
          <Input label="資本金" value={form.capital} onChange={e => setForm({ ...form, capital: e.target.value })} />
          <Select
            label="業種"
            value={form.industry}
            onChange={e => setForm({ ...form, industry: e.target.value })}
            options={INDUSTRIES.map(i => ({ value: i, label: i }))}
            placeholder="選択してください"
          />
        </div>
        <Textarea label="事業内容" value={form.business_description} onChange={e => setForm({ ...form, business_description: e.target.value })} rows={3} />
        <div className="grid grid-cols-3 gap-4">
          <Input label="従業員数" value={form.employee_count} onChange={e => setForm({ ...form, employee_count: e.target.value })} />
          <Input label="代表者" value={form.representative} onChange={e => setForm({ ...form, representative: e.target.value })} />
          <Input label="電話番号" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
        </div>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-200">
        <Button onClick={handleSave} loading={saving}>
          保存して次へ
        </Button>
      </div>
    </Card>
  )
}

// ============================================================
// Step 2: Business Plan Upload (placeholder)
// ============================================================

function BusinessPlanStep({
  projectId, onNext, onBack, supabase, toast,
}: {
  projectId: string
  onNext: () => void
  onBack: () => void
  supabase: ReturnType<typeof createClient>
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
}) {
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const path = `${projectId}/business_plan/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage.from('project-files').upload(path, file)
      if (uploadError) throw uploadError

      await supabase.from('uploaded_files').insert({
        project_id: projectId,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        category: 'business_plan',
        storage_path: path,
      })

      toast('ファイルをアップロードしました', 'success')
      // TODO: Trigger AI extraction
    } catch {
      toast('アップロードに失敗しました', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardTitle>事業計画書アップロード</CardTitle>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        事業計画書（PDF）をアップロードすると、AIが経営目標・戦略・施策を抽出します
      </p>

      <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
        <svg className="w-12 h-12 text-slate-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <p className="text-sm text-slate-600 mb-4">PDFファイルをアップロードしてください</p>
        <label className="inline-block">
          <input
            type="file"
            accept=".pdf"
            onChange={handleFileUpload}
            className="hidden"
          />
          <span className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-blue-700">
            {uploading ? 'アップロード中...' : 'ファイルを選択'}
          </span>
        </label>
      </div>

      <div className="flex justify-between mt-6 pt-4 border-t border-slate-200">
        <Button variant="secondary" onClick={onBack}>戻る</Button>
        <Button onClick={onNext}>次へ</Button>
      </div>
    </Card>
  )
}

// ============================================================
// Step 3: Org Chart Upload (placeholder)
// ============================================================

function OrgChartStep({
  projectId, onNext, onBack, supabase, toast, refreshProject,
}: {
  projectId: string
  onNext: () => void
  onBack: () => void
  supabase: ReturnType<typeof createClient>
  toast: (msg: string, type?: 'success' | 'error' | 'info') => void
  refreshProject: () => Promise<void>
}) {
  const [uploading, setUploading] = useState(false)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    try {
      const path = `${projectId}/org_chart/${Date.now()}_${file.name}`
      const { error: uploadError } = await supabase.storage.from('project-files').upload(path, file)
      if (uploadError) throw uploadError

      await supabase.from('uploaded_files').insert({
        project_id: projectId,
        file_name: file.name,
        file_size: file.size,
        file_type: file.type,
        category: 'org_chart',
        storage_path: path,
      })

      toast('ファイルをアップロードしました', 'success')
      // TODO: Trigger AI extraction for org chart
      await refreshProject()
    } catch {
      toast('アップロードに失敗しました', 'error')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Card>
      <CardTitle>組織図アップロード</CardTitle>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        組織図（PDF）をアップロードすると、AIが組織構造を抽出します
      </p>

      <div className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center">
        <svg className="w-12 h-12 text-slate-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <p className="text-sm text-slate-600 mb-4">組織図PDFをアップロードしてください</p>
        <label className="inline-block">
          <input type="file" accept=".pdf" onChange={handleFileUpload} className="hidden" />
          <span className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg cursor-pointer hover:bg-blue-700">
            {uploading ? 'アップロード中...' : 'ファイルを選択'}
          </span>
        </label>
      </div>

      <div className="flex justify-between mt-6 pt-4 border-t border-slate-200">
        <Button variant="secondary" onClick={onBack}>戻る</Button>
        <Button onClick={onNext}>次へ</Button>
      </div>
    </Card>
  )
}

// ============================================================
// Step 4: Strategy-Measure Linking (placeholder)
// ============================================================

function StrategyLinkStep({
  projectId, onNext, onBack,
}: {
  projectId: string
  onNext: () => void
  onBack: () => void
}) {
  return (
    <Card>
      <CardTitle>戦略-施策紐付け</CardTitle>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        AIが戦略と施策を自動的に紐付けます。手動で編集・追加も可能です。
      </p>

      <div className="py-8 text-center text-sm text-slate-500">
        事業計画書と組織図をアップロードすると、ここに戦略-施策の紐付けが表示されます。
      </div>

      <div className="flex justify-between mt-6 pt-4 border-t border-slate-200">
        <Button variant="secondary" onClick={onBack}>戻る</Button>
        <Button onClick={onNext}>次へ</Button>
      </div>
    </Card>
  )
}

// ============================================================
// Step 5: Invite Members (placeholder)
// ============================================================

function InviteMembersStep({
  projectId, onBack,
}: {
  projectId: string
  onBack: () => void
}) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('company_admin')
  const [loading, setLoading] = useState(false)
  const { toast } = useToast()

  const handleInvite = async () => {
    if (!email) return
    setLoading(true)
    try {
      const res = await fetch('/api/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, email, role }),
      })
      if (!res.ok) throw new Error()
      toast(`${email} を招待しました`, 'success')
      setEmail('')
    } catch {
      toast('招待に失敗しました', 'error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card>
      <CardTitle>メンバー招待</CardTitle>
      <p className="text-sm text-slate-500 mt-1 mb-6">
        事業会社の管理者やメンバーを招待します
      </p>

      <div className="flex gap-3">
        <div className="flex-1">
          <Input
            label="メールアドレス"
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="user@company.co.jp"
          />
        </div>
        <div className="w-48">
          <Select
            label="権限"
            value={role}
            onChange={e => setRole(e.target.value)}
            options={[
              { value: 'company_admin', label: '管理部門' },
              { value: 'department_manager', label: '部門責任者' },
              { value: 'executive', label: '経営層' },
            ]}
          />
        </div>
        <div className="pt-6">
          <Button onClick={handleInvite} loading={loading}>招待</Button>
        </div>
      </div>

      <div className="flex justify-between mt-6 pt-4 border-t border-slate-200">
        <Button variant="secondary" onClick={onBack}>戻る</Button>
        <Button variant="secondary" onClick={() => window.location.href = `/projects/${projectId}/dashboard`}>
          設定完了
        </Button>
      </div>
    </Card>
  )
}
