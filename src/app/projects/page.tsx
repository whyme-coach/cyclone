'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Card } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'
import { formatDateShort } from '@/lib/utils'
import type { Project } from '@/types'
import { PROJECT_STATUS_LABELS } from '@/types/roles'

const statusBadgeVariant = (status: string) => {
  switch (status) {
    case 'active': return 'success' as const
    case 'setup': return 'info' as const
    case 'planning': return 'info' as const
    case 'review': return 'warning' as const
    case 'closed': return 'default' as const
    default: return 'default' as const
  }
}

export default function ProjectsPage() {
  const { user, profile, loading: authLoading, signOut, organization } = useAuth()
  const [projects, setProjects] = useState<(Project & { company?: { name: string; industry?: string } })[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const router = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()
  const orgSetupDone = useRef(false)

  useEffect(() => {
    if (authLoading || !user || organization || orgSetupDone.current) return
    orgSetupDone.current = true
    fetch('/api/setup-org', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) }).catch(() => {})
  }, [authLoading, user, organization])

  useEffect(() => {
    if (!user || authLoading) return
    const fetchProjects = async () => {
      const { data: memberships } = await supabase.from('project_members').select('project_id').eq('user_id', user.id)
      if (!memberships || memberships.length === 0) {
        const { data: orgMemberships } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id)
        if (orgMemberships && orgMemberships.length > 0) {
          const orgIds = orgMemberships.map((m: { organization_id: string }) => m.organization_id)
          const { data } = await supabase.from('projects').select('*, company:companies(name, industry)').in('organization_id', orgIds).order('updated_at', { ascending: false })
          setProjects(data || [])
        }
        setLoading(false)
        return
      }
      const projectIds = memberships.map((m: { project_id: string }) => m.project_id)
      const { data } = await supabase.from('projects').select('*, company:companies(name, industry)').in('id', projectIds).order('updated_at', { ascending: false })
      setProjects(data || [])
      setLoading(false)
    }
    fetchProjects()
  }, [user, authLoading, supabase])

  if (authLoading || loading) {
    return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>
  }

  const filtered = projects.filter(p => {
    if (!search) return true
    const s = search.toLowerCase()
    const companyName = (p.company as { name: string } | undefined)?.name || ''
    return p.name.toLowerCase().includes(s) || companyName.toLowerCase().includes(s)
  })

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <h1 className="text-xl font-bold text-slate-900">Cyclone</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-slate-600">{profile?.full_name || user?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => signOut().then(() => router.push('/'))}>
              ログアウト
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-900">プロジェクト一覧</h2>
          <Button onClick={() => router.push('/projects/new')}>
            + 新規プロジェクト
          </Button>
        </div>

        {projects.length === 0 ? (
          <Card>
            <EmptyState
              title="プロジェクトがありません"
              description="新しいプロジェクトを作成して、事業計画の実行支援を始めましょう。"
              action={<Button onClick={() => router.push('/projects/new')}>新規プロジェクトを作成</Button>}
            />
          </Card>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Search & filter bar */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-4">
              <div className="relative flex-1 max-w-sm">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="プロジェクトを検索..."
                  className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-slate-400"
                />
              </div>
              <span className="text-xs text-slate-400">全 {filtered.length} 件</span>
            </div>

            {/* Table */}
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">クライアント名</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">業種</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">年度</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">ステータス</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500">更新日</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(project => {
                  const company = project.company as { name: string; industry?: string } | undefined
                  return (
                    <tr
                      key={project.id}
                      onClick={() => router.push(`/projects/${project.id}/dashboard`)}
                      className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-slate-900">{company?.name || project.name}</p>
                          <p className="text-xs text-slate-400">{project.name}</p>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-600">{company?.industry || '-'}</td>
                      <td className="px-4 py-3 text-sm text-slate-600">{project.fiscal_year}年度</td>
                      <td className="px-4 py-3">
                        <Badge variant={statusBadgeVariant(project.status)}>
                          {PROJECT_STATUS_LABELS[project.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-400">
                        {formatDateShort(project.updated_at)}
                      </td>
                      <td className="px-2 py-3">
                        <button
                          onClick={async (e) => {
                            e.stopPropagation()
                            const companyName = company?.name || project.name
                            if (!confirm(`「${companyName}」のプロジェクトを削除しますか？\n\nこの操作は取り消せません。プロジェクトに関連する全てのデータ（経営目標、戦略、施策、KPI、アクションプラン、報告等）が削除されます。`)) return
                            try {
                              await supabase.from('projects').delete().eq('id', project.id)
                              setProjects(prev => prev.filter(p => p.id !== project.id))
                              toast('プロジェクトを削除しました', 'info')
                            } catch {
                              toast('削除に失敗しました', 'error')
                            }
                          }}
                          className="text-slate-300 hover:text-red-500 p-1 transition-colors"
                          title="プロジェクトを削除"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
