'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useProjectContext } from '../../layout'
import { Card, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { ACTION_ITEM_STATUS_LABELS } from '@/types/roles'
import type { KPI, ActionItem, Measure } from '@/types'

export default function DepartmentPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string
  const deptId = params.deptId as string
  const { departments } = useProjectContext()
  const department = departments.find(d => d.id === deptId)
  const supabase = createClient()

  const [kpis, setKpis] = useState<KPI[]>([])
  const [actionItems, setActionItems] = useState<ActionItem[]>([])
  const [measures, setMeasures] = useState<Measure[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const [kpiRes, measRes, planRes] = await Promise.all([
        supabase.from('kpis').select('*').eq('department_id', deptId),
        supabase.from('measures').select('*').eq('department_id', deptId),
        supabase.from('action_plans').select('id').eq('department_id', deptId),
      ])
      if (kpiRes.data) setKpis(kpiRes.data)
      if (measRes.data) setMeasures(measRes.data)
      if (planRes.data && planRes.data.length > 0) {
        const planIds = planRes.data.map((p: { id: string }) => p.id)
        const { data: items } = await supabase.from('action_items').select('*').in('action_plan_id', planIds)
        if (items) setActionItems(items)
      }
      setLoading(false)
    }
    fetch()
  }, [deptId, supabase])

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  const basePath = `/projects/${projectId}/departments/${deptId}`
  const completedItems = actionItems.filter(i => i.status === 'completed').length
  const delayedItems = actionItems.filter(i => i.status === 'delayed').length
  const overallProgress = actionItems.length > 0 ? Math.round(actionItems.reduce((s, i) => s + i.progress_percent, 0) / actionItems.length) : 0

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">{department?.name || '部門'}</h2>

      {/* Summary cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-500">施策数</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{measures.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">KPI数</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{kpis.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">進捗率</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{overallProgress}%</p>
          <div className="mt-2 bg-slate-100 rounded-full h-2">
            <div className={cn('h-2 rounded-full', overallProgress >= 80 ? 'bg-green-500' : overallProgress >= 50 ? 'bg-blue-500' : 'bg-yellow-500')} style={{ width: `${overallProgress}%` }} />
          </div>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">アクション</p>
          <p className="text-2xl font-bold text-slate-900 mt-1">{completedItems}/{actionItems.length}</p>
          {delayedItems > 0 && <p className="text-xs text-red-500 mt-1">{delayedItems}件遅延</p>}
        </Card>
      </div>

      {/* Navigation cards */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`${basePath}/kpis`)}>
          <CardTitle>KPI管理</CardTitle>
          <p className="text-sm text-slate-500 mt-1">KPIの作成・AI提案・実績入力</p>
          {kpis.length > 0 && (
            <div className="mt-3 space-y-1">
              {kpis.slice(0, 3).map(k => (
                <p key={k.id} className="text-xs text-slate-600 truncate">・{k.name}{k.target_value != null ? ` (目標: ${k.target_value}${k.target_unit || ''})` : ''}</p>
              ))}
              {kpis.length > 3 && <p className="text-xs text-slate-400">他{kpis.length - 3}件</p>}
            </div>
          )}
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`${basePath}/plans`)}>
          <CardTitle>アクションプラン</CardTitle>
          <p className="text-sm text-slate-500 mt-1">Ganttチャートでアクションプランを管理</p>
          {actionItems.length > 0 && (
            <div className="mt-3 flex gap-2 flex-wrap">
              {Object.entries(ACTION_ITEM_STATUS_LABELS).map(([status, label]) => {
                const count = actionItems.filter(i => i.status === status).length
                if (count === 0) return null
                return <Badge key={status} variant={status === 'completed' ? 'success' : status === 'delayed' ? 'danger' : 'default'}>{label} {count}</Badge>
              })}
            </div>
          )}
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => router.push(`${basePath}/reports`)}>
          <CardTitle>進捗報告</CardTitle>
          <p className="text-sm text-slate-500 mt-1">AIコーチと対話して報告を作成</p>
        </Card>
      </div>
    </div>
  )
}
