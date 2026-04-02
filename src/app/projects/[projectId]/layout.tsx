'use client'

import { useState, useEffect, createContext, useContext } from 'react'
import { useParams, usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { useNotifications } from '@/hooks/useNotifications'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/utils'
import type { Project, ProjectMember, ProjectRole, Company, Department } from '@/types'

interface ProjectContextType {
  project: Project | null
  company: Company | null
  member: ProjectMember | null
  role: ProjectRole | null
  departments: Department[]
  refreshProject: () => Promise<void>
}

const ProjectContext = createContext<ProjectContextType>({
  project: null, company: null, member: null, role: null, departments: [], refreshProject: async () => {},
})

export function useProjectContext() {
  return useContext(ProjectContext)
}

const NAV_ITEMS = [
  { label: 'ダッシュボード', href: '/dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
  { label: '初期設定', href: '/setup', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z M15 12a3 3 0 11-6 0 3 3 0 016 0z', roles: ['consultant', 'company_admin'] },
  { label: '経営目標', href: '/goals', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { label: '戦略・施策', href: '/strategies', icon: 'M13 10V3L4 14h7v7l9-11h-7z' },
  { label: '報告', href: '/reports', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { label: '月次報告', href: '/reports/monthly', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', roles: ['consultant', 'company_admin'] },
  { label: 'レビュー', href: '/review', icon: 'M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15', roles: ['consultant', 'company_admin'] },
  { label: 'メンバー', href: '/members', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', roles: ['consultant', 'company_admin'] },
  { label: '設定', href: '/settings', icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4', roles: ['consultant', 'company_admin'] },
]

export default function ProjectLayout({ children }: { children: React.ReactNode }) {
  const params = useParams()
  const pathname = usePathname()
  const router = useRouter()
  const { user } = useAuth()
  const supabase = createClient()
  const projectId = params.projectId as string

  const [project, setProject] = useState<Project | null>(null)
  const [company, setCompany] = useState<Company | null>(null)
  const [member, setMember] = useState<ProjectMember | null>(null)
  const [departments, setDepartments] = useState<Department[]>([])
  const [loading, setLoading] = useState(true)
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const fetchProject = async () => {
    if (!user) return
    const [projectRes, memberRes, deptRes] = await Promise.all([
      supabase.from('projects').select('*, company:companies(*)').eq('id', projectId).single(),
      supabase.from('project_members').select('*').eq('project_id', projectId).eq('user_id', user.id).single(),
      supabase.from('departments').select('*').eq('project_id', projectId).order('sort_order'),
    ])

    if (projectRes.data) {
      const p = projectRes.data
      setProject(p)
      setCompany(p.company as unknown as Company)
    }
    if (memberRes.data) setMember(memberRes.data)
    if (deptRes.data) setDepartments(deptRes.data)
    setLoading(false)
  }

  useEffect(() => {
    if (user) fetchProject()
  }, [user, projectId])

  const role = member?.role as ProjectRole | null

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600">プロジェクトが見つかりません</p>
      </div>
    )
  }

  const basePath = `/projects/${projectId}`

  return (
    <ProjectContext.Provider value={{ project, company, member, role, departments, refreshProject: fetchProject }}>
      <div className="min-h-screen bg-slate-50 flex">
        {/* Sidebar */}
        <aside className={cn(
          'bg-white border-r border-slate-200 flex flex-col transition-all duration-200',
          sidebarOpen ? 'w-60' : 'w-0 overflow-hidden'
        )}>
          <div className="h-16 flex items-center px-4 border-b border-slate-200">
            <button onClick={() => router.push('/projects')} className="text-slate-400 hover:text-slate-600 mr-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">{company?.name}</p>
              <p className="text-xs text-slate-500">{project.fiscal_year}年度</p>
            </div>
          </div>

          <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
            {NAV_ITEMS
              .filter(item => !item.roles || (role && item.roles.includes(role)))
              .map(item => {
                const href = `${basePath}${item.href}`
                const active = pathname === href || pathname.startsWith(href + '/')
                return (
                  <button
                    key={item.href}
                    onClick={() => router.push(href)}
                    className={cn(
                      'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors',
                      active
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-slate-600 hover:bg-slate-50'
                    )}
                  >
                    <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                    </svg>
                    {item.label}
                  </button>
                )
              })}

            {/* Department sections for department_managers */}
            {departments.length > 0 && (
              <div className="pt-4 mt-4 border-t border-slate-200">
                <p className="px-3 text-xs font-semibold text-slate-400 uppercase mb-2">部門</p>
                {departments.map(dept => {
                  const href = `${basePath}/departments/${dept.id}`
                  const active = pathname.startsWith(href)
                  return (
                    <button
                      key={dept.id}
                      onClick={() => router.push(href)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2 text-sm rounded-lg transition-colors',
                        active
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-slate-600 hover:bg-slate-50'
                      )}
                    >
                      <svg className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      {dept.name}
                    </button>
                  )
                })}
              </div>
            )}
          </nav>
        </aside>

        {/* Main */}
        <div className="flex-1 flex flex-col min-w-0">
          <ProjectHeader
            project={project}
            userId={user?.id}
            sidebarOpen={sidebarOpen}
            onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          />
          <main className="flex-1 overflow-y-auto p-6">
            {children}
          </main>
        </div>
      </div>
    </ProjectContext.Provider>
  )
}

function ProjectHeader({ project, userId, sidebarOpen, onToggleSidebar }: {
  project: Project; userId: string | undefined; sidebarOpen: boolean; onToggleSidebar: () => void
}) {
  const router = useRouter()
  const { unreadCount } = useNotifications(userId)

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4">
      <div className="flex items-center gap-4">
        <button onClick={onToggleSidebar} className="text-slate-400 hover:text-slate-600">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <h1 className="text-lg font-semibold text-slate-900">{project.name}</h1>
      </div>
      <button onClick={() => router.push('/notifications')} className="relative text-slate-400 hover:text-slate-600 p-2">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </header>
  )
}
