'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Card } from '@/components/ui/Card'
import { FISCAL_MONTHS } from '@/lib/constants'
import { useToast } from '@/components/ui/Toast'

export default function NewProjectPage() {
  const { user, organization } = useAuth()
  const router = useRouter()
  const supabase = createClient()
  const { toast } = useToast()

  const [loading, setLoading] = useState(false)
  const [companyName, setCompanyName] = useState('')
  const [projectName, setProjectName] = useState('')
  const [fiscalYear, setFiscalYear] = useState(new Date().getFullYear())
  const [fiscalYearEnd, setFiscalYearEnd] = useState('3')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user) {
      toast('ログインしてください。', 'error')
      return
    }

    setLoading(true)
    try {
      // Ensure organization exists
      let orgId = organization?.id
      if (!orgId) {
        const res = await fetch('/api/setup-org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (!res.ok) throw new Error('組織の作成に失敗しました')
        const orgData = await res.json()
        orgId = orgData.organization?.id
        if (!orgId) throw new Error('組織の作成に失敗しました')
      }

      // Create company
      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert({
          organization_id: orgId,
          name: companyName,
          fiscal_year_end: parseInt(fiscalYearEnd),
        })
        .select()
        .single()

      if (companyError) throw companyError

      // Create project
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .insert({
          organization_id: orgId,
          company_id: company.id,
          name: projectName || `${companyName} ${fiscalYear}年度`,
          fiscal_year: fiscalYear,
          created_by: user.id,
        })
        .select()
        .single()

      if (projectError) throw projectError

      // Add current user as consultant member
      await supabase
        .from('project_members')
        .insert({
          project_id: project.id,
          user_id: user.id,
          role: 'consultant',
        })

      toast('プロジェクトを作成しました', 'success')
      router.push(`/projects/${project.id}/setup`)
    } catch (err) {
      toast('プロジェクトの作成に失敗しました', 'error')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center">
          <button onClick={() => router.back()} className="text-slate-600 hover:text-slate-900 mr-4">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold text-slate-900">新規プロジェクト</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <Card>
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              label="会社名"
              value={companyName}
              onChange={e => setCompanyName(e.target.value)}
              placeholder="株式会社〇〇"
              required
            />
            <Input
              label="プロジェクト名"
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="（空欄の場合、会社名+年度で自動生成）"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="対象年度"
                type="number"
                value={fiscalYear}
                onChange={e => setFiscalYear(parseInt(e.target.value))}
                required
              />
              <Select
                label="決算月"
                value={fiscalYearEnd}
                onChange={e => setFiscalYearEnd(e.target.value)}
                options={FISCAL_MONTHS.map(m => ({ value: m.value.toString(), label: m.label }))}
                required
              />
            </div>
            <div className="flex justify-end gap-3 pt-4">
              <Button variant="secondary" type="button" onClick={() => router.back()}>
                キャンセル
              </Button>
              <Button type="submit" loading={loading}>
                作成する
              </Button>
            </div>
          </form>
        </Card>
      </main>
    </div>
  )
}
