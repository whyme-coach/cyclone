'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Spinner } from '@/components/ui/Spinner'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useState } from 'react'

const NAV_ITEMS: Array<{ label: string; href: string; icon: string; consultantOnly?: boolean }> = [
  { label: 'プロジェクト一覧', href: '/projects', icon: 'M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z' },
  { label: '会社情報', href: '/projects/settings', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4', consultantOnly: true },
]

export default function ProjectsLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, organization, loading: authLoading, signOut } = useAuth()
  const pathname = usePathname()
  const router = useRouter()
  const [sidebarOpen] = useState(true)

  if (authLoading) return <div className="flex justify-center items-center min-h-screen"><Spinner size="lg" /></div>
  if (!user) { router.push('/'); return null }

  const isConsultant = !!organization
  const displayName = profile?.full_name || user.email?.split('@')[0] || ''
  const email = user.email || ''
  const initials = displayName ? displayName.slice(0, 2) : email.slice(0, 2)
  const orgName = organization?.name || 'Cyclone'

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className={cn(
        'bg-white border-r border-slate-200 flex flex-col transition-all duration-200 sticky top-0 h-screen',
        sidebarOpen ? 'w-60 shrink-0' : 'w-0 overflow-hidden'
      )}>
        {/* Org header */}
        <div className="h-16 flex items-center px-4 border-b border-slate-200">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900 truncate">{orgName}</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-4 px-2 space-y-1">
          {NAV_ITEMS
            .filter(item => !item.consultantOnly || isConsultant)
            .map(item => {
              const active = pathname === item.href
              return (
                <button
                  key={item.href}
                  onClick={() => router.push(item.href)}
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
        </nav>

        {/* User section */}
        <UserSection
          displayName={displayName}
          email={email}
          initials={initials}
          onSignOut={async () => { await signOut(); router.push('/') }}
        />
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <main className="flex-1 p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

function UserSection({ displayName, email, initials, onSignOut }: {
  displayName: string; email: string; initials: string; onSignOut: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <div className="border-t border-slate-200 p-2 relative">
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-50 transition-colors text-left"
      >
        <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold shrink-0">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900 truncate">{displayName}</p>
          <p className="text-[11px] text-slate-400 truncate">{email}</p>
        </div>
        <svg className={cn('w-4 h-4 text-slate-400 shrink-0 transition-transform', menuOpen && 'rotate-180')} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      </button>

      {menuOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
          <div className="absolute bottom-full left-2 right-2 mb-1 bg-white border border-slate-200 rounded-lg shadow-lg z-20 py-1">
            <button
              onClick={() => { setMenuOpen(false); onSignOut() }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              ログアウト
            </button>
          </div>
        </>
      )}
    </div>
  )
}
