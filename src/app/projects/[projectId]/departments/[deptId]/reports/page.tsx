'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { useProjectContext } from '../../../layout'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { callAI, parseAIJsonResponse, getAITextResponse } from '@/lib/ai/helpers'
import { COACH_REPORT_SYSTEM_PROMPT } from '@/lib/ai/prompts/coach-report'
import { PROGRESS_STATUS_LABELS } from '@/types/roles'
import { cn } from '@/lib/utils'
import type { ProgressReport, ActionItem, ProgressStatus } from '@/types'

export default function DepartmentReportsPage() {
  const params = useParams()
  const deptId = params.deptId as string
  const { project, departments } = useProjectContext()
  const { user } = useAuth()
  const [reports, setReports] = useState<(ProgressReport & { action_item?: ActionItem })[]>([])
  const [actionItems, setActionItems] = useState<ActionItem[]>([])
  const [loading, setLoading] = useState(true)
  const [showCoach, setShowCoach] = useState(false)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const { toast } = useToast()
  const supabase = createClient()
  const department = departments.find(d => d.id === deptId)

  useEffect(() => {
    if (!project) return
    const fetchAll = async () => {
      const { data: plans } = await supabase
        .from('action_plans')
        .select('id')
        .eq('project_id', project.id)
        .eq('department_id', deptId)

      if (plans && plans.length > 0) {
        const planIds = plans.map((p: { id: string }) => p.id)
        const { data: items } = await supabase
          .from('action_items')
          .select('*')
          .in('action_plan_id', planIds)
          .order('start_date')
        if (items) setActionItems(items)
      }

      const { data: reportData } = await supabase
        .from('progress_reports')
        .select('*')
        .eq('project_id', project.id)
        .order('created_at', { ascending: false })

      if (reportData) setReports(reportData)
      setLoading(false)
    }
    fetchAll()
  }, [project, deptId, supabase])

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">進捗報告</h2>
          <p className="text-sm text-slate-500 mt-1">{department?.name}</p>
        </div>
      </div>

      {/* Action Items to Report */}
      <Card>
        <CardTitle>報告対象のアクションアイテム</CardTitle>
        {actionItems.length === 0 ? (
          <p className="text-sm text-slate-500 mt-2">アクションプランからアクションアイテムを作成してください</p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {actionItems.filter(ai => ai.status !== 'completed' && ai.status !== 'cancelled').map(item => (
              <div key={item.id} className="py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-900">{item.title}</p>
                  <span className="text-xs text-slate-500">{item.start_date} 〜 {item.end_date}</span>
                </div>
                <Button
                  size="sm"
                  onClick={() => { setSelectedItemId(item.id); setShowCoach(true) }}
                >
                  AIコーチで報告
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Past Reports */}
      <Card>
        <CardTitle>報告履歴</CardTitle>
        {reports.length === 0 ? (
          <EmptyState title="報告はまだありません" description="AIコーチと対話して報告を作成しましょう" />
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {reports.map(report => (
              <div key={report.id} className="py-3">
                <div className="flex items-center gap-2 mb-1">
                  <StatusBadge status={report.status} />
                  <span className="text-xs text-slate-400">{new Date(report.created_at).toLocaleDateString('ja-JP')}</span>
                  {report.is_draft && <Badge>下書き</Badge>}
                </div>
                {report.activities_completed && (
                  <p className="text-sm text-slate-700 mt-1"><span className="font-medium">実施内容:</span> {report.activities_completed}</p>
                )}
                {report.reflections && (
                  <p className="text-sm text-slate-600 mt-1"><span className="font-medium">振り返り:</span> {report.reflections}</p>
                )}
                {report.next_actions && (
                  <p className="text-sm text-slate-600 mt-1"><span className="font-medium">ネクストアクション:</span> {report.next_actions}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* AI Coach Dialog */}
      {showCoach && selectedItemId && project && user && (
        <AICoachDialog
          projectId={project.id}
          actionItemId={selectedItemId}
          actionItem={actionItems.find(ai => ai.id === selectedItemId)!}
          userId={user.id}
          onClose={() => setShowCoach(false)}
          onReportCreated={(report) => {
            setReports(prev => [report, ...prev])
            setShowCoach(false)
            toast('報告を作成しました', 'success')
          }}
        />
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ProgressStatus }) {
  const variant = {
    on_track: 'success' as const,
    at_risk: 'warning' as const,
    delayed: 'danger' as const,
    completed: 'success' as const,
    blocked: 'danger' as const,
  }
  return <Badge variant={variant[status]}>{PROGRESS_STATUS_LABELS[status]}</Badge>
}

function AICoachDialog({
  projectId, actionItemId, actionItem, userId, onClose, onReportCreated,
}: {
  projectId: string
  actionItemId: string
  actionItem: ActionItem
  userId: string
  onClose: () => void
  onReportCreated: (report: ProgressReport) => void
}) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    // Initial greeting from AI coach
    const initCoach = async () => {
      setSending(true)
      try {
        const data = await callAI('coach-report', {
          messages: [{
            role: 'user',
            content: `アクションアイテム「${actionItem.title}」の進捗報告を作成したいです。\n説明: ${actionItem.description || 'なし'}\n期間: ${actionItem.start_date} 〜 ${actionItem.end_date}\n現在の進捗: ${actionItem.progress_percent}%`,
          }],
          system: COACH_REPORT_SYSTEM_PROMPT,
        })
        const text = getAITextResponse(data)
        setMessages([
          { role: 'user', content: `「${actionItem.title}」の進捗報告を作成したいです` },
          { role: 'assistant', content: text },
        ])
      } catch {
        setMessages([{ role: 'assistant', content: 'AIコーチの初期化に失敗しました。もう一度お試しください。' }])
      } finally {
        setSending(false)
      }
    }
    initCoach()
  }, [actionItem])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const userMsg = input.trim()
    setInput('')
    const newMessages = [...messages, { role: 'user' as const, content: userMsg }]
    setMessages(newMessages)
    setSending(true)

    try {
      const data = await callAI('coach-report', {
        messages: newMessages,
        system: COACH_REPORT_SYSTEM_PROMPT,
      })
      const text = getAITextResponse(data)
      setMessages(prev => [...prev, { role: 'assistant', content: text }])

      // Check if AI returned a structured report
      const jsonResult = parseAIJsonResponse(data)
      if (jsonResult && typeof jsonResult === 'object' && (jsonResult as Record<string, unknown>).ready) {
        const r = jsonResult as Record<string, string>
        // Save report
        const { data: reportData } = await supabase.from('progress_reports').insert({
          action_item_id: actionItemId,
          project_id: projectId,
          reporter_user_id: userId,
          status: r.status || 'on_track',
          activities_completed: r.activities_completed,
          reflections: r.reflections,
          next_actions: r.next_actions,
          submitted_at: new Date().toISOString(),
          is_draft: false,
        }).select().single()
        if (reportData) onReportCreated(reportData)
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'エラーが発生しました。もう一度お試しください。' }])
    } finally {
      setSending(false)
    }
  }

  return (
    <Modal open title="AIコーチ - 進捗報告" onClose={onClose} size="lg">
      <div className="flex flex-col h-[500px]">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2">
          {messages.map((msg, i) => (
            <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn(
                'max-w-[80%] rounded-2xl px-4 py-2 text-sm',
                msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'
              )}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {sending && (
            <div className="flex justify-start">
              <div className="bg-slate-100 rounded-2xl px-4 py-2">
                <Spinner size="sm" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex gap-2 border-t border-slate-200 pt-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="メッセージを入力..."
            className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={sending}
          />
          <Button onClick={handleSend} loading={sending} disabled={!input.trim()}>
            送信
          </Button>
        </div>
      </div>
    </Modal>
  )
}
