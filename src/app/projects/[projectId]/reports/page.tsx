'use client'

import { useState, useEffect } from 'react'
import { useProjectContext } from '../layout'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { callAI, getAITextResponse } from '@/lib/ai/helpers'
import { MEETING_MATERIALS_SYSTEM_PROMPT } from '@/lib/ai/prompts/meeting-materials'
import { PROGRESS_STATUS_LABELS } from '@/types/roles'
import { formatDate } from '@/lib/utils'
import type { ProgressReport, ReportComment, UserProfile, ProgressStatus } from '@/types'

export default function ReportsTimelinePage() {
  const { project, departments, role } = useProjectContext()
  const { user } = useAuth()
  const [reports, setReports] = useState<(ProgressReport & { reporter?: UserProfile; comments?: (ReportComment & { user?: UserProfile })[] })[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()
  const supabase = createClient()

  useEffect(() => {
    if (!project) return
    const fetch = async () => {
      const { data } = await supabase
        .from('progress_reports')
        .select('*, reporter:user_profiles!reporter_user_id(*)')
        .eq('project_id', project.id)
        .eq('is_draft', false)
        .order('submitted_at', { ascending: false })
        .limit(50)
      if (data) {
        // Fetch comments for each report
        const reportIds = data.map((r: ProgressReport) => r.id)
        const { data: comments } = await supabase
          .from('report_comments')
          .select('*, user:user_profiles!user_id(*)')
          .in('progress_report_id', reportIds)
          .order('created_at')

        const commentsByReport: Record<string, (ReportComment & { user?: UserProfile })[]> = {}
        if (comments) {
          for (const c of comments) {
            if (!commentsByReport[c.progress_report_id]) commentsByReport[c.progress_report_id] = []
            commentsByReport[c.progress_report_id].push(c)
          }
        }
        setReports(data.map((r: ProgressReport & { reporter?: UserProfile }) => ({
          ...r,
          comments: commentsByReport[r.id] || [],
        })))
      }
      setLoading(false)
    }
    fetch()
  }, [project, supabase])

  const handleAddComment = async (reportId: string, content: string) => {
    if (!user || !content.trim()) return
    try {
      const { data } = await supabase.from('report_comments').insert({
        progress_report_id: reportId,
        user_id: user.id,
        content: content.trim(),
      }).select('*, user:user_profiles!user_id(*)').single()
      if (data) {
        setReports(prev => prev.map(r =>
          r.id === reportId
            ? { ...r, comments: [...(r.comments || []), data] }
            : r
        ))
        toast('コメントを投稿しました', 'success')
      }
    } catch {
      toast('コメントの投稿に失敗しました', 'error')
    }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  const [showMeetingPrompt, setShowMeetingPrompt] = useState(false)
  const [meetingPrompt, setMeetingPrompt] = useState('')
  const [generatingPrompt, setGeneratingPrompt] = useState(false)

  const handleGenerateMeetingPrompt = async () => {
    setGeneratingPrompt(true)
    try {
      const reportsText = reports.slice(0, 20).map(r =>
        `[${r.reporter?.full_name || ''}] ${r.status}: ${r.activities_completed || '-'}`
      ).join('\n')
      const aiData = await callAI('meeting-materials', {
        system: MEETING_MATERIALS_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: `${project?.name}の月次報告をもとに、経営会議資料のプロンプトを生成してください。\n\n【報告一覧】\n${reportsText || '報告なし'}` }],
      })
      const text = getAITextResponse(aiData)
      setMeetingPrompt(text)
      setShowMeetingPrompt(true)
    } catch { toast('プロンプト生成に失敗しました', 'error') }
    finally { setGeneratingPrompt(false) }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">報告タイムライン</h2>
        {(role === 'consultant' || role === 'company_admin') && reports.length > 0 && (
          <Button variant="secondary" onClick={handleGenerateMeetingPrompt} loading={generatingPrompt}>
            経営会議資料プロンプト
          </Button>
        )}
      </div>

      {showMeetingPrompt && (
        <Modal open title="経営会議資料プロンプト" onClose={() => setShowMeetingPrompt(false)} size="lg">
          <div className="space-y-4">
            <p className="text-sm text-slate-500">以下のプロンプトをClaude webに貼り付けて、パワーポイント形式の資料を生成できます。</p>
            <textarea
              value={meetingPrompt}
              readOnly
              rows={15}
              className="w-full px-4 py-3 text-sm text-slate-900 border border-slate-300 rounded-lg bg-slate-50 font-mono"
            />
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => { navigator.clipboard.writeText(meetingPrompt); toast('コピーしました', 'success') }}>
                クリップボードにコピー
              </Button>
              <Button onClick={() => setShowMeetingPrompt(false)}>閉じる</Button>
            </div>
          </div>
        </Modal>
      )}

      {reports.length === 0 ? (
        <Card><EmptyState title="報告がまだありません" description="各部門のユーザーが進捗報告を提出するとここに表示されます" /></Card>
      ) : (
        <div className="space-y-4">
          {reports.map(report => (
            <Card key={report.id}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-slate-900">{report.reporter?.full_name || report.reporter?.email}</span>
                <StatusBadge status={report.status} />
                <span className="text-xs text-slate-400">{report.submitted_at ? formatDate(report.submitted_at) : ''}</span>
              </div>
              {report.activities_completed && (
                <div className="mb-2">
                  <p className="text-xs font-medium text-slate-500">実施内容</p>
                  <p className="text-sm text-slate-700">{report.activities_completed}</p>
                </div>
              )}
              {report.reflections && (
                <div className="mb-2">
                  <p className="text-xs font-medium text-slate-500">振り返り・学び</p>
                  <p className="text-sm text-slate-700">{report.reflections}</p>
                </div>
              )}
              {report.next_actions && (
                <div className="mb-2">
                  <p className="text-xs font-medium text-slate-500">ネクストアクション</p>
                  <p className="text-sm text-slate-700">{report.next_actions}</p>
                </div>
              )}

              {/* Comments */}
              <div className="mt-4 pt-3 border-t border-slate-100">
                {report.comments && report.comments.length > 0 && (
                  <div className="space-y-2 mb-3">
                    {report.comments.map(c => (
                      <div key={c.id} className="bg-slate-50 rounded-lg px-3 py-2">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-medium text-slate-700">{c.user?.full_name || c.user?.email}</span>
                          <span className="text-xs text-slate-400">{formatDate(c.created_at)}</span>
                        </div>
                        <p className="text-sm text-slate-600">{c.content}</p>
                      </div>
                    ))}
                  </div>
                )}
                <CommentInput onSubmit={(content) => handleAddComment(report.id, content)} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: ProgressStatus }) {
  const variant = { on_track: 'success' as const, at_risk: 'warning' as const, delayed: 'danger' as const, completed: 'success' as const, blocked: 'danger' as const }
  return <Badge variant={variant[status]}>{PROGRESS_STATUS_LABELS[status]}</Badge>
}

function CommentInput({ onSubmit }: { onSubmit: (content: string) => void }) {
  const [content, setContent] = useState('')
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={content}
        onChange={e => setContent(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && content.trim()) { onSubmit(content); setContent('') } }}
        placeholder="フィードバックを入力..."
        className="flex-1 px-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <Button size="sm" variant="secondary" onClick={() => { if (content.trim()) { onSubmit(content); setContent('') } }} disabled={!content.trim()}>
        送信
      </Button>
    </div>
  )
}
