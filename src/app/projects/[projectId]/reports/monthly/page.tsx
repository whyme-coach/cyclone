'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useProjectContext } from '../../layout'
import { Card, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import type { MonthlyReport } from '@/types'

export default function MonthlyReportsListPage() {
  const { project, departments } = useProjectContext()
  const [reports, setReports] = useState<MonthlyReport[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (!project) return
    const fetch = async () => {
      const { data } = await supabase
        .from('monthly_reports')
        .select('*')
        .eq('project_id', project.id)
        .order('report_month', { ascending: false })
      if (data) setReports(data)
      setLoading(false)
    }
    fetch()
  }, [project, supabase])

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  const statusLabel = (s: string) => s === 'finalized' ? '確定済み' : s === 'reviewed' ? 'レビュー済み' : '下書き'
  const statusVariant = (s: string) => s === 'finalized' ? 'success' as const : s === 'reviewed' ? 'info' as const : 'warning' as const

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">月次報告一覧</h2>

      {reports.length === 0 ? (
        <Card><EmptyState title="月次報告がまだありません" description="各部門のユーザーが月次報告を作成するとここに表示されます" /></Card>
      ) : (
        <div className="space-y-3">
          {reports.map(r => {
            const dept = departments.find(d => d.id === r.department_id)
            const monthLabel = r.report_month ? r.report_month.substring(0, 7) : ''
            return (
              <Card key={r.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => {
                if (r.department_id) router.push(`/projects/${project?.id}/departments/${r.department_id}/reports/monthly/${monthLabel}`)
              }}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900">{monthLabel}</span>
                      <Badge>{dept?.name || '全体'}</Badge>
                      <Badge variant={statusVariant(r.status)}>{statusLabel(r.status)}</Badge>
                    </div>
                    {r.finalized_at && <p className="text-xs text-slate-400 mt-1">確定日: {formatDate(r.finalized_at)}</p>}
                  </div>
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                </div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
