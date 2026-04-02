'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useProjectContext } from '../layout'
import { Card, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { createClient } from '@/lib/supabase/client'
import { PROJECT_STATUS_LABELS, ACTION_ITEM_STATUS_LABELS } from '@/types/roles'
import { cn } from '@/lib/utils'
import type { KPI, KPIRecord, ActionItem } from '@/types'

// Dynamic import for recharts (client-only)
import dynamic from 'next/dynamic'
const LineChart = dynamic(() => import('recharts').then(m => m.LineChart), { ssr: false })
const Line = dynamic(() => import('recharts').then(m => m.Line), { ssr: false })
const XAxis = dynamic(() => import('recharts').then(m => m.XAxis), { ssr: false })
const YAxis = dynamic(() => import('recharts').then(m => m.YAxis), { ssr: false })
const Tooltip = dynamic(() => import('recharts').then(m => m.Tooltip), { ssr: false })
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false })

export default function ProjectDashboardPage() {
  const { project, company, role, departments } = useProjectContext()
  const [kpis, setKpis] = useState<(KPI & { records?: KPIRecord[] })[]>([])
  const [actionItems, setActionItems] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    if (!project) return
    const fetchData = async () => {
      const [kpiRes, planRes] = await Promise.all([
        supabase.from('kpis').select('*').eq('project_id', project.id).order('created_at'),
        supabase.from('action_plans').select('id').eq('project_id', project.id),
      ])

      if (kpiRes.data) {
        // Fetch records for each KPI
        const kpiIds = kpiRes.data.map((k: KPI) => k.id)
        const { data: records } = await supabase
          .from('kpi_records')
          .select('*')
          .in('kpi_id', kpiIds)
          .order('record_date')
        const recordsByKpi: Record<string, KPIRecord[]> = {}
        if (records) {
          for (const r of records) {
            if (!recordsByKpi[r.kpi_id]) recordsByKpi[r.kpi_id] = []
            recordsByKpi[r.kpi_id].push(r)
          }
        }
        setKpis(kpiRes.data.map((k: KPI) => ({ ...k, records: recordsByKpi[k.id] || [] })))
      }

      if (planRes.data && planRes.data.length > 0) {
        const planIds = planRes.data.map((p: { id: string }) => p.id)
        const { data: items } = await supabase
          .from('action_items')
          .select('*')
          .in('action_plan_id', planIds)
        if (items) setActionItems(items)
      }
      setLoading(false)
    }
    fetchData()
  }, [project, supabase])

  if (!project) return null
  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  const statusCounts = actionItems.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const totalItems = actionItems.length
  const completedItems = statusCounts['completed'] || 0
  const delayedItems = statusCounts['delayed'] || 0
  const overallProgress = totalItems > 0 ? Math.round(actionItems.reduce((sum, i) => sum + i.progress_percent, 0) / totalItems) : 0

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">ダッシュボード</h2>
        <p className="text-sm text-slate-500 mt-1">{company?.name} - {project.fiscal_year}年度</p>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-500">ステータス</p>
          <Badge variant={project.status === 'active' ? 'success' : 'info'} className="mt-2">
            {PROJECT_STATUS_LABELS[project.status]}
          </Badge>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">全体進捗率</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{overallProgress}%</p>
          <div className="mt-2 bg-slate-100 rounded-full h-2">
            <div className={cn('h-2 rounded-full', overallProgress >= 80 ? 'bg-green-500' : overallProgress >= 50 ? 'bg-blue-500' : 'bg-yellow-500')} style={{ width: `${overallProgress}%` }} />
          </div>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">アクションアイテム</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{completedItems}/{totalItems}</p>
          <p className="text-xs text-slate-400">完了</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">遅延</p>
          <p className={cn('mt-1 text-2xl font-bold', delayedItems > 0 ? 'text-red-600' : 'text-green-600')}>{delayedItems}件</p>
        </Card>
      </div>

      {/* KPI Charts */}
      {kpis.length > 0 && (
        <Card>
          <CardTitle>KPIトレンド</CardTitle>
          <div className="mt-4 grid gap-6 md:grid-cols-2">
            {kpis.filter(k => k.records && k.records.length > 0).map(kpi => (
              <div key={kpi.id} className="border border-slate-100 rounded-lg p-4">
                <p className="text-sm font-medium text-slate-900 mb-1">{kpi.name}</p>
                <p className="text-xs text-slate-500 mb-3">
                  目標: {kpi.target_value} {kpi.target_unit}
                  {kpi.current_value != null && ` / 現在: ${kpi.current_value} ${kpi.target_unit}`}
                </p>
                <div className="h-40">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={kpi.records?.map(r => ({ date: r.record_date.slice(5), value: Number(r.value) }))}>
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <Tooltip />
                      <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))}
          </div>
          {kpis.filter(k => k.records && k.records.length > 0).length === 0 && (
            <p className="text-sm text-slate-400 mt-2">KPIの実績データが入力されるとトレンドグラフが表示されます</p>
          )}
        </Card>
      )}

      {/* Department Overview */}
      {departments.length > 0 && (
        <Card>
          <CardTitle>部門一覧</CardTitle>
          <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {departments.map(dept => {
              const deptItems = actionItems.filter(ai => {
                // Find plans for this dept through action_plan
                return true // simplified - would need plan->dept mapping
              })
              return (
                <button
                  key={dept.id}
                  onClick={() => router.push(`/projects/${project.id}/departments/${dept.id}`)}
                  className="text-left p-4 border border-slate-200 rounded-lg hover:border-blue-300 hover:shadow-sm transition-all"
                >
                  <p className="text-sm font-medium text-slate-900">{dept.name}</p>
                  <p className="text-xs text-slate-400 mt-1">レベル {dept.level}</p>
                </button>
              )
            })}
          </div>
        </Card>
      )}

      {/* Status breakdown */}
      {totalItems > 0 && (
        <Card>
          <CardTitle>アクションアイテムステータス</CardTitle>
          <div className="mt-4 flex gap-4 flex-wrap">
            {Object.entries(ACTION_ITEM_STATUS_LABELS).map(([status, label]) => {
              const count = statusCounts[status] || 0
              const pct = totalItems > 0 ? Math.round((count / totalItems) * 100) : 0
              return (
                <div key={status} className="text-center">
                  <p className="text-2xl font-bold text-slate-900">{count}</p>
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className="text-xs text-slate-400">{pct}%</p>
                </div>
              )
            })}
          </div>
        </Card>
      )}
    </div>
  )
}
