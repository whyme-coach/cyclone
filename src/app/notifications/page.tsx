'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { createClient } from '@/lib/supabase/client'
import { formatDate, cn } from '@/lib/utils'
import type { Notification } from '@/types'

const TYPE_LABELS: Record<string, string> = {
  report_due: '報告期限',
  report_overdue: '報告遅延',
  report_submitted: '報告提出',
  feedback_received: 'フィードバック',
  review_started: 'レビュー開始',
  plan_revised: 'プラン変更',
  invitation: '招待',
  year_closed: '年度クローズ',
  ai_alert: 'AIアラート',
}

const TYPE_VARIANTS: Record<string, 'default' | 'success' | 'warning' | 'danger' | 'info'> = {
  report_due: 'warning',
  report_overdue: 'danger',
  report_submitted: 'success',
  feedback_received: 'info',
  review_started: 'info',
  plan_revised: 'warning',
  invitation: 'info',
  year_closed: 'default',
  ai_alert: 'warning',
}

export default function NotificationsPage() {
  const { user, loading: authLoading, signOut } = useAuth()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (!user) return
    const fetch = async () => {
      const { data } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(100)
      if (data) setNotifications(data)
      setLoading(false)
    }
    fetch()
  }, [user, supabase])

  const handleMarkRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
  }

  const handleMarkAllRead = async () => {
    if (!user) return
    await supabase.from('notifications').update({ is_read: true }).eq('user_id', user.id).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
  }

  const handleClick = (notification: Notification) => {
    handleMarkRead(notification.id)
    if (notification.link) router.push(notification.link)
  }

  if (authLoading || loading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>

  const unreadCount = notifications.filter(n => !n.is_read).length

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => router.back()} className="text-slate-600 hover:text-slate-900">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
            </button>
            <h1 className="text-xl font-bold text-slate-900">通知</h1>
            {unreadCount > 0 && <Badge variant="danger">{unreadCount}件未読</Badge>}
          </div>
          {unreadCount > 0 && (
            <Button size="sm" variant="ghost" onClick={handleMarkAllRead}>すべて既読にする</Button>
          )}
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        {notifications.length === 0 ? (
          <Card><EmptyState title="通知はありません" description="新しい通知があるとここに表示されます" /></Card>
        ) : (
          <div className="space-y-2">
            {notifications.map(n => (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={cn(
                  'w-full text-left bg-white border border-slate-200 rounded-lg px-4 py-3 hover:shadow-sm transition-shadow',
                  !n.is_read && 'border-blue-200 bg-blue-50/50'
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5">
                      {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                      <Badge variant={TYPE_VARIANTS[n.type] || 'default'}>{TYPE_LABELS[n.type] || n.type}</Badge>
                    </div>
                    <p className={cn('text-sm', n.is_read ? 'text-slate-600' : 'text-slate-900 font-medium')}>{n.title}</p>
                    {n.body && <p className="text-xs text-slate-500 mt-0.5">{n.body}</p>}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">{formatDate(n.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
