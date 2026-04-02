'use client'

import { useState, useEffect, useRef } from 'react'
import { useProjectContext } from '../layout'
import { useAuth } from '@/hooks/useAuth'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/client'
import { callAI, getAITextResponse, parseAIJsonResponse } from '@/lib/ai/helpers'
import { QUARTERLY_SUMMARY_SYSTEM_PROMPT } from '@/lib/ai/prompts/quarterly-summary'
import { formatDate } from '@/lib/utils'
import type { ReviewCycleRecord } from '@/types'

export default function ReviewPage() {
  const { project, role } = useProjectContext()
  const { user } = useAuth()
  const [cycles, setCycles] = useState<ReviewCycleRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [showCoach, setShowCoach] = useState(false)
  const [activeCycleId, setActiveCycleId] = useState<string | null>(null)
  const [showCloseModal, setShowCloseModal] = useState(false)
  const { toast } = useToast()
  const supabase = createClient()
  const canManage = role === 'consultant' || role === 'company_admin'

  useEffect(() => {
    if (!project) return
    const fetch = async () => {
      const { data } = await supabase.from('review_cycles').select('*').eq('project_id', project.id).order('period_start')
      if (data) setCycles(data)
      setLoading(false)
    }
    fetch()
  }, [project, supabase])

  const handleCreateCycle = async () => {
    if (!project) return
    const now = new Date()
    const cycleType = project.review_cycle || 'quarterly'
    const monthSpan = cycleType === 'quarterly' ? 3 : 6
    const start = new Date(now.getFullYear(), now.getMonth(), 1)
    const end = new Date(start.getFullYear(), start.getMonth() + monthSpan, 0)
    try {
      const { data } = await supabase.from('review_cycles').insert({
        project_id: project.id, cycle_type: cycleType,
        period_start: start.toISOString().split('T')[0], period_end: end.toISOString().split('T')[0], status: 'pending',
      }).select().single()
      if (data) setCycles(prev => [...prev, data])
      toast('レビューサイクルを作成しました', 'success')
    } catch { toast('作成に失敗しました', 'error') }
  }

  const handleUpdateStatus = async (id: string, status: 'in_progress' | 'completed') => {
    await supabase.from('review_cycles').update({ status }).eq('id', id)
    setCycles(prev => prev.map(c => c.id === id ? { ...c, status } as ReviewCycleRecord : c))
    toast(status === 'in_progress' ? 'レビューを開始しました' : 'レビューを完了しました', 'success')
  }

  const handleCloseYear = async () => {
    if (!project || !user) return
    try {
      await supabase.from('projects').update({ status: 'closed', is_closed: true, closed_at: new Date().toISOString(), closed_by: user.id }).eq('id', project.id)
      // Create year-end review cycle
      await supabase.from('review_cycles').insert({
        project_id: project.id, cycle_type: 'year_end', period_start: project.fiscal_year_start || `${project.fiscal_year}-04-01`,
        period_end: project.fiscal_year_end || `${project.fiscal_year + 1}-03-31`, status: 'completed',
      })
      toast('年度をクローズしました', 'success')
      setShowCloseModal(false)
      window.location.reload()
    } catch { toast('クローズに失敗しました', 'error') }
  }

  if (loading) return <div className="flex justify-center py-12"><Spinner size="lg" /></div>

  const typeLabels: Record<string, string> = { quarterly: '四半期', semi_annual: '半期', year_end: '年度末' }
  const statusConfig: Record<string, { label: string; variant: 'default' | 'info' | 'success' }> = {
    pending: { label: '未開始', variant: 'default' }, in_progress: { label: '進行中', variant: 'info' }, completed: { label: '完了', variant: 'success' },
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-900">レビュー管理</h2>
        {canManage && !project?.is_closed && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleCreateCycle}>レビューサイクルを作成</Button>
            <Button variant="danger" onClick={() => setShowCloseModal(true)}>年度クローズ</Button>
          </div>
        )}
      </div>

      {project?.is_closed && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800 font-medium">この年度はクローズされています。</p>
          {project.closed_at && <p className="text-xs text-yellow-600 mt-1">クローズ日: {formatDate(project.closed_at)}</p>}
        </div>
      )}

      {cycles.length === 0 ? (
        <Card><EmptyState title="レビューサイクルがありません" description={canManage ? 'レビューサイクルを作成して振り返りを実施しましょう' : '管理者が作成するとここに表示されます'} /></Card>
      ) : (
        <div className="space-y-4">
          {cycles.map(cycle => (
            <Card key={cycle.id}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={statusConfig[cycle.status]?.variant || 'default'}>{statusConfig[cycle.status]?.label}</Badge>
                    <span className="text-sm font-medium text-slate-900">{typeLabels[cycle.cycle_type]}レビュー</span>
                  </div>
                  <p className="text-xs text-slate-500">期間: {formatDate(cycle.period_start)} 〜 {formatDate(cycle.period_end)}</p>
                </div>
                <div className="flex gap-2">
                  {cycle.status === 'in_progress' && (
                    <Button size="sm" variant="secondary" onClick={() => { setActiveCycleId(cycle.id); setShowCoach(true) }}>AIコーチで振り返り</Button>
                  )}
                  {canManage && cycle.status === 'pending' && <Button size="sm" onClick={() => handleUpdateStatus(cycle.id, 'in_progress')}>開始</Button>}
                  {canManage && cycle.status === 'in_progress' && <Button size="sm" onClick={() => handleUpdateStatus(cycle.id, 'completed')}>完了</Button>}
                </div>
              </div>
              {cycle.ai_summary && (
                <div className="mt-3 p-3 bg-slate-50 rounded-lg text-sm text-slate-600">
                  {typeof (cycle.ai_summary as Record<string, unknown>).quarter_summary === 'string' && (
                    <p>{(cycle.ai_summary as Record<string, unknown>).quarter_summary as string}</p>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* AI Coach for quarterly review */}
      {showCoach && activeCycleId && project && (
        <ReviewCoachDialog
          projectId={project.id}
          cycleId={activeCycleId}
          onClose={() => setShowCoach(false)}
          onComplete={async (summary) => {
            await supabase.from('review_cycles').update({ ai_summary: summary }).eq('id', activeCycleId)
            setCycles(prev => prev.map(c => c.id === activeCycleId ? { ...c, ai_summary: summary } as ReviewCycleRecord : c))
            setShowCoach(false)
            toast('振り返りを保存しました', 'success')
          }}
        />
      )}

      {showCloseModal && (
        <Modal open title="年度クローズ" onClose={() => setShowCloseModal(false)}>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">年度をクローズすると、全てのアクションプランが編集不可になります。</p>
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-600 space-y-1">
              <p className="font-medium text-red-700">注意:</p>
              <p>・アクションアイテムの編集・追加・削除ができなくなります</p>
              <p>・進捗報告の新規作成ができなくなります</p>
              <p>・新年度は「新規プロジェクト」で作成してください</p>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowCloseModal(false)}>キャンセル</Button>
              <Button variant="danger" onClick={handleCloseYear}>年度をクローズ</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

function ReviewCoachDialog({ projectId, cycleId, onClose, onComplete }: {
  projectId: string; cycleId: string; onClose: () => void; onComplete: (summary: Record<string, unknown>) => Promise<void>
}) {
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const init = async () => {
      setSending(true)
      try {
        const data = await callAI('quarterly-summary', {
          system: QUARTERLY_SUMMARY_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: '四半期の振り返りを始めたいです。今期の取り組みについて話を聞いてください。' }],
        })
        const text = getAITextResponse(data)
        setMessages([
          { role: 'user', content: '四半期の振り返りを始めたいです。' },
          { role: 'assistant', content: text },
        ])
      } catch {
        setMessages([{ role: 'assistant', content: 'AIコーチの初期化に失敗しました。' }])
      } finally { setSending(false) }
    }
    init()
  }, [])

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  const handleSend = async () => {
    if (!input.trim() || sending) return
    const userMsg = input.trim()
    setInput('')
    const newMessages = [...messages, { role: 'user' as const, content: userMsg }]
    setMessages(newMessages)
    setSending(true)
    try {
      const data = await callAI('quarterly-summary', { system: QUARTERLY_SUMMARY_SYSTEM_PROMPT, messages: newMessages })
      const text = getAITextResponse(data)
      setMessages(prev => [...prev, { role: 'assistant', content: text }])
      const jsonResult = parseAIJsonResponse(data)
      if (jsonResult && typeof jsonResult === 'object' && (jsonResult as Record<string, unknown>).ready) {
        await onComplete(jsonResult as Record<string, unknown>)
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'エラーが発生しました。' }])
    } finally { setSending(false) }
  }

  return (
    <Modal open title="AIコーチ - 四半期振り返り" onClose={onClose} size="lg">
      <div className="flex flex-col h-[500px]">
        <div className="flex-1 overflow-y-auto space-y-3 mb-4 pr-2">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700'}`}>
                <p className="whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {sending && <div className="flex justify-start"><div className="bg-slate-100 rounded-2xl px-4 py-2"><Spinner size="sm" /></div></div>}
          <div ref={messagesEndRef} />
        </div>
        <div className="flex gap-2 border-t border-slate-200 pt-3">
          <input type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
            placeholder="メッセージを入力..." disabled={sending}
            className="flex-1 px-4 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <Button onClick={handleSend} loading={sending} disabled={!input.trim()}>送信</Button>
        </div>
      </div>
    </Modal>
  )
}
