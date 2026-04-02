'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useProjectContext } from '../../../../../layout'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { callAI, parseAIJsonResponse } from '@/lib/ai/helpers'
import { COMPILE_MONTHLY_REPORT_SYSTEM_PROMPT } from '@/lib/ai/prompts/compile-monthly-report'
import type { MonthlyReport, ProgressReport } from '@/types'

export default function MonthlyReportPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.projectId as string
  const deptId = params.deptId as string
  const month = params.month as string // YYYY-MM format
  const { project, departments } = useProjectContext()
  const { user } = useAuth()
  const { toast } = useToast()
  const supabase = createClient()
  const department = departments.find(d => d.id === deptId)

  const [report, setReport] = useState<MonthlyReport | null>(null)
  const [progressReports, setProgressReports] = useState<ProgressReport[]>([])
  const [compiling, setCompiling] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [editContent, setEditContent] = useState('')
  const [aiAnalysis, setAiAnalysis] = useState<Record<string, unknown> | null>(null)

  useEffect(() => {
    const fetch = async () => {
      // Check existing monthly report
      const { data: existing } = await supabase
        .from('monthly_reports')
        .select('*')
        .eq('project_id', projectId)
        .eq('department_id', deptId)
        .eq('report_month', `${month}-01`)
        .single()
      if (existing) {
        setReport(existing)
        setEditContent(existing.content ? JSON.stringify(existing.content, null, 2) : '')
        setAiAnalysis(existing.ai_analysis as Record<string, unknown> | null)
      }

      // Fetch progress reports for this month
      const startDate = `${month}-01`
      const endDate = new Date(parseInt(month.split('-')[0]), parseInt(month.split('-')[1]), 0).toISOString().split('T')[0]
      const { data: reports } = await supabase
        .from('progress_reports')
        .select('*')
        .eq('project_id', projectId)
        .eq('is_draft', false)
        .gte('submitted_at', startDate)
        .lte('submitted_at', endDate + 'T23:59:59')
      if (reports) setProgressReports(reports)
      setLoading(false)
    }
    fetch()
  }, [projectId, deptId, month, supabase])

  const handleCompile = async () => {
    setCompiling(true)
    try {
      const reportsText = progressReports.map(r =>
        `ステータス: ${r.status}\n実施内容: ${r.activities_completed || '-'}\n振り返り: ${r.reflections || '-'}\nネクストアクション: ${r.next_actions || '-'}`
      ).join('\n\n---\n\n')

      const aiData = await callAI('compile-monthly-report', {
        system: COMPILE_MONTHLY_REPORT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `部門「${department?.name}」の${month}月の進捗報告をまとめてください。\n\n【進捗報告一覧】\n${reportsText || '報告なし'}` }],
      })
      const result = parseAIJsonResponse(aiData) as Record<string, unknown> | null
      if (result) {
        setAiAnalysis(result)
        const contentStr = JSON.stringify(result, null, 2)
        setEditContent(contentStr)

        // Save or update
        if (report) {
          await supabase.from('monthly_reports').update({ content: result, ai_analysis: result }).eq('id', report.id)
        } else {
          const { data } = await supabase.from('monthly_reports').insert({
            project_id: projectId, department_id: deptId, report_month: `${month}-01`,
            content: result, ai_analysis: result, status: 'draft',
          }).select().single()
          if (data) setReport(data)
        }
        toast('月次報告を作成しました', 'success')
      }
    } catch { toast('AI作成に失敗しました', 'error') }
    finally { setCompiling(false) }
  }

  const handleFinalize = async () => {
    if (!report || !user) return
    if (!confirm('月次報告を確定しますか？確定後は管理部門に送付されます。')) return
    setSaving(true)
    try {
      await supabase.from('monthly_reports').update({
        status: 'finalized', finalized_at: new Date().toISOString(), finalized_by: user.id,
      }).eq('id', report.id)
      setReport(prev => prev ? { ...prev, status: 'finalized' as const } : null)
      toast('月次報告を確定しました', 'success')
    } catch { toast('確定に失敗しました', 'error') }
    finally { setSaving(false) }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">{month} 月次報告</h2>
          <p className="text-sm text-slate-500 mt-1">{department?.name}</p>
        </div>
        {report && <Badge variant={report.status === 'finalized' ? 'success' : report.status === 'reviewed' ? 'info' : 'warning'}>{report.status === 'finalized' ? '確定済み' : report.status === 'reviewed' ? 'レビュー済み' : '下書き'}</Badge>}
      </div>

      {/* Source reports */}
      <Card>
        <CardTitle>元となる進捗報告 ({progressReports.length}件)</CardTitle>
        {progressReports.length === 0 ? (
          <p className="text-sm text-slate-500 mt-2">この月の進捗報告はまだありません</p>
        ) : (
          <div className="mt-3 space-y-2 max-h-48 overflow-y-auto">
            {progressReports.map(r => (
              <div key={r.id} className="text-xs text-slate-600 p-2 bg-slate-50 rounded">
                <Badge variant={r.status === 'on_track' ? 'success' : r.status === 'delayed' ? 'danger' : 'warning'}>{r.status}</Badge>
                <span className="ml-2">{r.activities_completed?.substring(0, 80) || '-'}</span>
              </div>
            ))}
          </div>
        )}
        <div className="mt-4">
          <Button onClick={handleCompile} loading={compiling} disabled={report?.status === 'finalized'}>
            AIで月次報告を作成
          </Button>
        </div>
      </Card>

      {/* AI Analysis */}
      {aiAnalysis && (
        <Card>
          <CardTitle>AI分析結果</CardTitle>
          <div className="mt-3 space-y-3">
            {typeof (aiAnalysis as Record<string, unknown>).summary === 'string' && (
              <div><p className="text-xs font-medium text-slate-500">サマリー</p><p className="text-sm text-slate-700">{String((aiAnalysis as Record<string, unknown>).summary)}</p></div>
            )}
            {Array.isArray((aiAnalysis as Record<string, unknown>).achievements) && (
              <div><p className="text-xs font-medium text-slate-500">達成事項</p>
                {((aiAnalysis as Record<string, unknown>).achievements as string[]).map((a, i) => <p key={i} className="text-sm text-slate-600">・{a}</p>)}
              </div>
            )}
            {Array.isArray((aiAnalysis as Record<string, unknown>).challenges) && (
              <div><p className="text-xs font-medium text-slate-500">課題</p>
                {((aiAnalysis as Record<string, unknown>).challenges as string[]).map((c, i) => <p key={i} className="text-sm text-slate-600">・{c}</p>)}
              </div>
            )}
            {Array.isArray((aiAnalysis as Record<string, unknown>).risk_alerts) && ((aiAnalysis as Record<string, unknown>).risk_alerts as Array<Record<string, string>>).length > 0 && (
              <div><p className="text-xs font-medium text-red-500">リスクアラート</p>
                {((aiAnalysis as Record<string, unknown>).risk_alerts as Array<Record<string, string>>).map((r, i) => (
                  <div key={i} className="p-2 bg-red-50 rounded text-sm text-red-700 mt-1"><Badge variant="danger">{r.level}</Badge> {r.item} - {r.recommendation}</div>
                ))}
              </div>
            )}
            {typeof (aiAnalysis as Record<string, unknown>).advice === 'string' && (
              <div className="p-3 bg-blue-50 rounded-lg"><p className="text-xs font-medium text-blue-600">アドバイス</p><p className="text-sm text-blue-700">{String((aiAnalysis as Record<string, unknown>).advice)}</p></div>
            )}
          </div>
        </Card>
      )}

      {/* Finalize */}
      {report && report.status !== 'finalized' && (
        <div className="flex justify-end gap-3">
          <Button variant="secondary" onClick={() => router.back()}>戻る</Button>
          <Button onClick={handleFinalize} loading={saving}>月次報告を確定・送付</Button>
        </div>
      )}
    </div>
  )
}
