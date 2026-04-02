'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
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
  const [projects, setProjects] = useState<(Project & { company?: { name: string } })[]>([])
  const [loading, setLoading] = useState(true)
  const [settingUpOrg, setSettingUpOrg] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  // Auto-create organization if not exists
  useEffect(() => {
    if (authLoading || !user || organization || settingUpOrg) return
    const setupOrg = async () => {
      setSettingUpOrg(true)
      try {
        const res = await fetch('/api/setup-org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (res.ok) {
          // Reload to pick up the new org
          window.location.reload()
        }
      } catch {
        // ignore
      } finally {
        setSettingUpOrg(false)
      }
    }
    setupOrg()
  }, [authLoading, user, organization, settingUpOrg])

  useEffect(() => {
    if (!user || authLoading) return
    const fetchProjects = async () => {
      // Get projects where user is a member
      const { data: memberships } = await supabase
        .from('project_members')
        .select('project_id')
        .eq('user_id', user.id)

      if (!memberships || memberships.length === 0) {
        // Also check org membership for consultants
        const { data: orgMemberships } = await supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)

        if (orgMemberships && orgMemberships.length > 0) {
          const orgIds = orgMemberships.map((m: { organization_id: string }) => m.organization_id)
          const { data } = await supabase
            .from('projects')
            .select('*, company:companies(name)')
            .in('organization_id', orgIds)
            .order('updated_at', { ascending: false })
          setProjects(data || [])
        }
        setLoading(false)
        return
      }

      const projectIds = memberships.map((m: { project_id: string }) => m.project_id)
      const { data } = await supabase
        .from('projects')
        .select('*, company:companies(name)')
        .in('id', projectIds)
        .order('updated_at', { ascending: false })

      setProjects(data || [])
      setLoading(false)
    }
    fetchProjects()
  }, [user, supabase])

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

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
            新規プロジェクト
          </Button>
        </div>

        {projects.length === 0 ? (
          <Card>
            <EmptyState
              title="プロジェクトがありません"
              description="新しいプロジェクトを作成して、事業計画の実行支援を始めましょう。"
              action={
                <Button onClick={() => router.push('/projects/new')}>
                  新規プロジェクトを作成
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map(project => (
              <Card
                key={project.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/projects/${project.id}/dashboard`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="font-semibold text-slate-900">{project.name}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {(project.company as { name: string } | undefined)?.name}
                    </p>
                  </div>
                  <Badge variant={statusBadgeVariant(project.status)}>
                    {PROJECT_STATUS_LABELS[project.status]}
                  </Badge>
                </div>
                <div className="text-xs text-slate-400">
                  {project.fiscal_year}年度
                </div>
              </Card>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
