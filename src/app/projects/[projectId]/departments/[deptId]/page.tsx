'use client'

import { useParams } from 'next/navigation'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import Link from 'next/link'

export default function DepartmentPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const deptId = params.deptId as string
  const basePath = `/projects/${projectId}/departments/${deptId}`

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">部門ダッシュボード</h2>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <Link href={`${basePath}/kpis`}>
            <CardTitle>KPI管理</CardTitle>
            <p className="text-sm text-slate-500 mt-1">KPIの作成・管理・実績入力</p>
          </Link>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <Link href={`${basePath}/plans`}>
            <CardTitle>アクションプラン</CardTitle>
            <p className="text-sm text-slate-500 mt-1">Ganttチャートでアクションプランを管理</p>
          </Link>
        </Card>
        <Card className="cursor-pointer hover:shadow-md transition-shadow">
          <Link href={`${basePath}/reports`}>
            <CardTitle>進捗報告</CardTitle>
            <p className="text-sm text-slate-500 mt-1">週次/月次の進捗報告を作成</p>
          </Link>
        </Card>
      </div>
    </div>
  )
}
