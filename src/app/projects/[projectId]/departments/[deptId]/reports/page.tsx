'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { useProjectContext } from '../../../layout'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { callAI, getAITextResponse, parseAIJsonResponse } from '@/lib/ai/helpers'
import { COACH_REPORT_SYSTEM_PROMPT } from '@/lib/ai/prompts/coach-report'
import { COMPILE_MONTHLY_REPORT_SYSTEM_PROMPT, COMPILE_MONTHLY_REPORT_USER_PROMPT } from '@/lib/ai/prompts/compile-monthly-report'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import type { ActionPlan, ActionItem, ProgressReport, TimelinePost, TimelineComment, UserProfile } from '@/types'

// ============================================================
// Types
// ============================================================

type TabKey = 'weekly' | 'monthly' | 'timeline'
type ReportMode = 'form' | 'coach'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface GanttActionItem extends ActionItem {
  planTitle: string
}

interface TimelinePostWithUser extends TimelinePost {
  user_profile?: UserProfile
  comments?: (TimelineComment & { user_profile?: UserProfile })[]
}

// ============================================================
// Constants
// ============================================================

const STATUS_OPTIONS = [
  { value: 'on_track', label: '順調' },
  { value: 'at_risk', label: 'リスクあり' },
  { value: 'delayed', label: '遅延' },
  { value: 'completed', label: '完了' },
  { value: 'blocked', label: 'ブロック中' },
]

const STATUS_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'default' }> = {
  on_track: { label: '順調', variant: 'success' },
  at_risk: { label: 'リスクあり', variant: 'warning' },
  delayed: { label: '遅延', variant: 'danger' },
  completed: { label: '完了', variant: 'info' },
  blocked: { label: 'ブロック中', variant: 'danger' },
  in_progress: { label: '進行中', variant: 'info' },
  not_started: { label: '未着手', variant: 'default' },
}

const POST_TYPE_BADGE: Record<string, { label: string; variant: 'info' | 'success' | 'warning' }> = {
  weekly_report: { label: '週次報告', variant: 'info' },
  monthly_report: { label: '月次報告', variant: 'success' },
  plan_change: { label: 'プラン変更', variant: 'warning' },
}

// ============================================================
// Helpers
// ============================================================

function relativeTime(dateStr: string): string {
  const now = new Date()
  const d = new Date(dateStr)
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'たった今'
  if (diffMin < 60) return `${diffMin}分前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour}時間前`
  const diffDay = Math.floor(diffHour / 24)
  if (diffDay === 1) return '昨日'
  if (diffDay < 30) return `${diffDay}日前`
  const diffMonth = Math.floor(diffDay / 30)
  return `${diffMonth}ヶ月前`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
}

function getMonthOptions(fiscalYear: number): { value: string; label: string }[] {
  const months: { value: string; label: string }[] = []
  // April of fiscalYear through March of fiscalYear+1
  for (let i = 0; i < 12; i++) {
    const month = ((3 + i) % 12) + 1 // 4,5,...12,1,2,3
    const year = month >= 4 ? fiscalYear : fiscalYear + 1
    const val = `${year}-${String(month).padStart(2, '0')}`
    months.push({ value: val, label: `${year}年${month}月` })
  }
  return months
}

// ============================================================
// Main Page Component
// ============================================================

export default function ReportsPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const deptId = params.deptId as string
  const { project, company, departments, member } = useProjectContext()
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const department = departments.find(d => d.id === deptId)

  const [activeTab, setActiveTab] = useState<TabKey>('weekly')
  const [loading, setLoading] = useState(true)

  // ---- Weekly state ----
  const [actionItems, setActionItems] = useState<GanttActionItem[]>([])
  const [selectedItem, setSelectedItem] = useState<GanttActionItem | null>(null)
  const [reportMode, setReportMode] = useState<ReportMode>('form')

  // Form fields
  const [formStatus, setFormStatus] = useState('on_track')
  const [formPlanned, setFormPlanned] = useState('')
  const [formActivities, setFormActivities] = useState('')
  const [formReflections, setFormReflections] = useState('')
  const [formChallenges, setFormChallenges] = useState('')
  const [formNextActions, setFormNextActions] = useState('')
  const [formDeadline, setFormDeadline] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Coach state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [userInput, setUserInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [coachDone, setCoachDone] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // ---- Monthly state ----
  const [selectedMonth, setSelectedMonth] = useState('')
  const [monthlyReports, setMonthlyReports] = useState<(ProgressReport & { action_item?: ActionItem })[]>([])
  const [monthlyContent, setMonthlyContent] = useState('')
  const [monthlyAiLoading, setMonthlyAiLoading] = useState(false)
  const [monthlySubmitting, setMonthlySubmitting] = useState(false)
  const [monthlyLoading, setMonthlyLoading] = useState(false)

  // ---- Timeline state ----
  const [timelinePosts, setTimelinePosts] = useState<TimelinePostWithUser[]>([])
  const [timelineLoading, setTimelineLoading] = useState(false)
  const [expandedComments, setExpandedComments] = useState<Set<string>>(new Set())
  const [expandedContent, setExpandedContent] = useState<Set<string>>(new Set())
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({})
  const [commentSubmitting, setCommentSubmitting] = useState<string | null>(null)

  // ---- Derived ----
  const fiscalYear = project?.fiscal_year || new Date().getFullYear()
  const monthOptions = useMemo(() => getMonthOptions(fiscalYear), [fiscalYear])
  const ganttStartDate = useMemo(() => new Date(fiscalYear, 3, 1), [fiscalYear])

  const MONTH_LABELS = ['4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月', '1月', '2月', '3月']

  // ---- Default month ----
  useEffect(() => {
    if (!selectedMonth && monthOptions.length > 0) {
      const now = new Date()
      const val = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      const match = monthOptions.find(m => m.value === val)
      setSelectedMonth(match ? match.value : monthOptions[0].value)
    }
  }, [monthOptions, selectedMonth])

  // ============================================================
  // Data Fetching
  // ============================================================

  const fetchActionItems = useCallback(async () => {
    if (!project) return
    setLoading(true)
    const { data } = await supabase
      .from('action_plans')
      .select('id, title, action_items(*)')
      .eq('department_id', deptId)
      .eq('project_id', project.id)
      .order('created_at')

    if (data) {
      const items: GanttActionItem[] = []
      for (const plan of data as (ActionPlan & { action_items: ActionItem[] })[]) {
        for (const item of plan.action_items || []) {
          items.push({ ...item, planTitle: plan.title })
        }
      }
      items.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
      setActionItems(items)
    }
    setLoading(false)
  }, [project, deptId, supabase])

  const fetchMonthlyData = useCallback(async () => {
    if (!project || !selectedMonth) return
    setMonthlyLoading(true)
    const [year, month] = selectedMonth.split('-').map(Number)
    const startDate = new Date(year, month - 1, 1).toISOString()
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString()

    // Get action item IDs for this department
    const { data: planData } = await supabase
      .from('action_plans')
      .select('id, action_items(id, title)')
      .eq('department_id', deptId)
      .eq('project_id', project.id)

    const itemMap = new Map<string, string>()
    if (planData) {
      for (const plan of planData as (ActionPlan & { action_items: { id: string; title: string }[] })[]) {
        for (const ai of plan.action_items || []) {
          itemMap.set(ai.id, ai.title)
        }
      }
    }

    if (itemMap.size === 0) {
      setMonthlyReports([])
      setMonthlyLoading(false)
      return
    }

    const { data: reports } = await supabase
      .from('progress_reports')
      .select('*')
      .in('action_item_id', Array.from(itemMap.keys()))
      .gte('submitted_at', startDate)
      .lte('submitted_at', endDate)
      .order('submitted_at', { ascending: false })

    if (reports) {
      setMonthlyReports(
        reports.map((r: ProgressReport) => ({
          ...r,
          action_item: { id: r.action_item_id, title: itemMap.get(r.action_item_id) || '' } as ActionItem,
        }))
      )
    } else {
      setMonthlyReports([])
    }
    setMonthlyLoading(false)
  }, [project, deptId, selectedMonth, supabase])

  const fetchTimeline = useCallback(async () => {
    if (!project) return
    setTimelineLoading(true)

    const { data: posts } = await supabase
      .from('timeline_posts')
      .select('*')
      .eq('project_id', project.id)
      .eq('department_id', deptId)
      .order('created_at', { ascending: false })
      .limit(50)

    if (!posts || posts.length === 0) {
      setTimelinePosts([])
      setTimelineLoading(false)
      return
    }

    // Fetch user profiles (two-step: collect IDs, then batch fetch)
    const userIds = [...new Set(posts.map((p: TimelinePost) => p.user_id))]
    const profileMap = new Map<string, UserProfile>()

    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('*')
        .in('id', userIds)
      if (profiles) for (const p of profiles) profileMap.set(p.id, p)
    }

    // Fetch comments
    const postIds = posts.map((p: TimelinePost) => p.id)
    const { data: comments } = await supabase
      .from('timeline_comments')
      .select('*')
      .in('post_id', postIds)
      .order('created_at', { ascending: true })

    // Fetch any missing commenter profiles
    if (comments && comments.length > 0) {
      const commentUserIds = [...new Set(comments.map((c: { user_id: string }) => c.user_id))]
      const missing = commentUserIds.filter(id => !profileMap.has(id as string)) as string[]
      if (missing.length > 0) {
        const { data: moreProfiles } = await supabase
          .from('user_profiles')
          .select('*')
          .in('id', missing)
        if (moreProfiles) for (const p of moreProfiles) profileMap.set(p.id, p)
      }
    }

    const commentsByPost = new Map<string, (TimelineComment & { user_profile?: UserProfile })[]>()
    if (comments) {
      for (const c of comments) {
        const list = commentsByPost.get(c.post_id) || []
        list.push({ ...c, user_profile: profileMap.get(c.user_id) })
        commentsByPost.set(c.post_id, list)
      }
    }

    setTimelinePosts(
      posts.map((p: TimelinePost) => ({
        ...p,
        user_profile: profileMap.get(p.user_id),
        comments: commentsByPost.get(p.id) || [],
      }))
    )
    setTimelineLoading(false)
  }, [project, deptId, supabase])

  // Initial load + tab-based loads
  useEffect(() => { fetchActionItems() }, [fetchActionItems])
  useEffect(() => { if (activeTab === 'monthly') fetchMonthlyData() }, [activeTab, selectedMonth, fetchMonthlyData])
  useEffect(() => { if (activeTab === 'timeline') fetchTimeline() }, [activeTab, fetchTimeline])

  // ============================================================
  // Weekly: Form helpers
  // ============================================================

  const clearForm = useCallback(() => {
    setFormStatus('on_track')
    setFormPlanned('')
    setFormActivities('')
    setFormReflections('')
    setFormChallenges('')
    setFormNextActions('')
    setFormDeadline('')
    setSelectedItem(null)
    setMessages([])
    setCoachDone(false)
    setUserInput('')
    setReportMode('form')
  }, [])

  const selectActionItem = useCallback((item: GanttActionItem) => {
    setSelectedItem(item)
    setMessages([])
    setCoachDone(false)
    setReportMode('form')
    setFormStatus(item.status === 'completed' ? 'completed' : 'on_track')
    setFormPlanned('')
    setFormActivities('')
    setFormReflections('')
    setFormChallenges('')
    setFormNextActions('')
    setFormDeadline('')
  }, [])

  // ============================================================
  // Weekly: Submit report
  // ============================================================

  const handleSubmitWeekly = async () => {
    if (!selectedItem || !project || !member) return
    setSubmitting(true)
    try {
      // 1. Save progress report
      const res1 = await fetch('/api/save-progress-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          actionItemId: selectedItem.id,
          report: {
            status: formStatus,
            planned_actions: formPlanned,
            activities_completed: formActivities,
            reflections: formReflections,
            challenges: formChallenges,
            next_actions: formNextActions,
            next_action_deadline: formDeadline || null,
          },
        }),
      })
      if (!res1.ok) throw new Error('Save report failed')

      // 2. Create timeline post
      const statusLabel = STATUS_OPTIONS.find(s => s.value === formStatus)?.label || formStatus
      const summary = [
        `ステータス: ${statusLabel}`,
        formActivities ? `実施内容: ${formActivities}` : '',
        formChallenges ? `課題: ${formChallenges}` : '',
        formNextActions ? `ネクストアクション: ${formNextActions}` : '',
      ].filter(Boolean).join('\n')

      const res2 = await fetch('/api/save-timeline-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          departmentId: deptId,
          postType: 'weekly_report',
          title: selectedItem.title,
          content: summary,
          referenceId: selectedItem.id,
        }),
      })
      if (!res2.ok) throw new Error('Timeline post failed')

      toast('週次報告をタイムラインに投稿しました', 'success')
      clearForm()
      fetchActionItems()
    } catch {
      toast('報告の保存に失敗しました', 'error')
    } finally {
      setSubmitting(false)
    }
  }

  // ============================================================
  // Weekly: AI Coach
  // ============================================================

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => { scrollToBottom() }, [messages, scrollToBottom])

  const checkForReportJson = useCallback((aiData: unknown) => {
    const parsed = parseAIJsonResponse(aiData) as {
      ready?: boolean
      status?: string
      planned_actions?: string
      activities_completed?: string
      reflections?: string
      challenges?: string
      next_actions?: string
      next_action_deadline?: string
    } | null
    if (parsed?.ready) {
      if (parsed.status) setFormStatus(parsed.status)
      if (parsed.planned_actions) setFormPlanned(parsed.planned_actions)
      if (parsed.activities_completed) setFormActivities(parsed.activities_completed)
      if (parsed.reflections) setFormReflections(parsed.reflections)
      if (parsed.challenges) setFormChallenges(parsed.challenges)
      if (parsed.next_actions) setFormNextActions(parsed.next_actions)
      if (parsed.next_action_deadline) setFormDeadline(parsed.next_action_deadline)
      setCoachDone(true)
      setReportMode('form')
      return true
    }
    return false
  }, [])

  // Auto-start coach when switching to coach mode with a selected item
  useEffect(() => {
    if (reportMode !== 'coach' || !selectedItem || !project || messages.length > 0) return

    const startCoach = async () => {
      setAiLoading(true)
      try {
        const contextMsg = `アクションアイテム「${selectedItem.title}」の週次報告を作成したいです。\n部門: ${department?.name || ''}\n計画: ${selectedItem.planTitle}\n期間: ${selectedItem.start_date} 〜 ${selectedItem.end_date}\n現在のステータス: ${STATUS_BADGE[selectedItem.status]?.label || selectedItem.status}\n進捗: ${selectedItem.progress_percent}%`

        const userMsg: ChatMessage = {
          role: 'user',
          content: contextMsg,
          timestamp: new Date().toISOString(),
        }
        const aiData = await callAI('coach-report', {
          system: COACH_REPORT_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: contextMsg }],
        })
        const aiText = getAITextResponse(aiData)
        const aiMsg: ChatMessage = {
          role: 'assistant',
          content: aiText,
          timestamp: new Date().toISOString(),
        }
        setMessages([userMsg, aiMsg])
        checkForReportJson(aiData)
      } catch {
        toast('AIコーチの起動に失敗しました', 'error')
      } finally {
        setAiLoading(false)
      }
    }
    startCoach()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportMode, selectedItem])

  const handleSendCoachMessage = async () => {
    if (!userInput.trim() || aiLoading) return
    const userMsg: ChatMessage = {
      role: 'user',
      content: userInput.trim(),
      timestamp: new Date().toISOString(),
    }
    const newMsgs = [...messages, userMsg]
    setMessages(newMsgs)
    setUserInput('')
    setAiLoading(true)
    try {
      const aiData = await callAI('coach-report', {
        system: COACH_REPORT_SYSTEM_PROMPT,
        messages: newMsgs.map(m => ({ role: m.role, content: m.content })),
      })
      const aiText = getAITextResponse(aiData)
      setMessages(prev => [...prev, { role: 'assistant', content: aiText, timestamp: new Date().toISOString() }])
      if (checkForReportJson(aiData)) {
        toast('AIが報告内容をまとめました。内容を確認して投稿してください。', 'info')
      }
    } catch {
      toast('メッセージの送信に失敗しました', 'error')
    } finally {
      setAiLoading(false)
    }
  }

  // ============================================================
  // Monthly: Compile
  // ============================================================

  const handleCompileMonthly = async () => {
    if (!project || monthlyReports.length === 0) return
    setMonthlyAiLoading(true)
    try {
      const reports = monthlyReports.map(r => ({
        date: r.submitted_at ? formatDate(r.submitted_at) : '',
        actionItemName: r.action_item?.title || '',
        status: STATUS_BADGE[r.status]?.label || r.status,
        planned_actions: r.planned_actions || undefined,
        activities_completed: r.activities_completed || undefined,
        reflections: r.reflections || undefined,
        challenges: r.challenges || undefined,
        next_actions: r.next_actions || undefined,
      }))

      const userPrompt = COMPILE_MONTHLY_REPORT_USER_PROMPT({
        departmentName: department?.name || '',
        reportMonth: selectedMonth,
        reports,
      })

      const aiData = await callAI('compile-monthly-report', {
        system: COMPILE_MONTHLY_REPORT_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      })

      const parsed = parseAIJsonResponse(aiData) as {
        summary?: string
        achievements?: string[]
        challenges?: string[]
        kpi_summary?: string
        next_month_focus?: string[]
        risk_alerts?: Array<{ item: string; level: string; recommendation: string }>
        advice?: string
      } | null

      if (parsed) {
        const parts: string[] = []
        if (parsed.summary) parts.push(`【サマリー】\n${parsed.summary}`)
        if (parsed.achievements?.length) parts.push(`【達成事項】\n${parsed.achievements.map(a => `・${a}`).join('\n')}`)
        if (parsed.challenges?.length) parts.push(`【課題】\n${parsed.challenges.map(c => `・${c}`).join('\n')}`)
        if (parsed.kpi_summary) parts.push(`【KPI状況】\n${parsed.kpi_summary}`)
        if (parsed.next_month_focus?.length) parts.push(`【来月の重点事項】\n${parsed.next_month_focus.map(f => `・${f}`).join('\n')}`)
        if (parsed.risk_alerts?.length) {
          parts.push(`【リスクアラート】\n${parsed.risk_alerts.map(r => `・[${r.level}] ${r.item}: ${r.recommendation}`).join('\n')}`)
        }
        if (parsed.advice) parts.push(`【アドバイス】\n${parsed.advice}`)
        setMonthlyContent(parts.join('\n\n'))
      } else {
        setMonthlyContent(getAITextResponse(aiData) || '月次報告の生成に失敗しました')
      }
    } catch {
      toast('月次報告の生成に失敗しました', 'error')
    } finally {
      setMonthlyAiLoading(false)
    }
  }

  const handleSubmitMonthly = async () => {
    if (!project || !monthlyContent.trim()) return
    setMonthlySubmitting(true)
    try {
      const res1 = await fetch('/api/save-monthly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          departmentId: deptId,
          reportMonth: selectedMonth + '-01',
          content: { text: monthlyContent },
        }),
      })
      if (!res1.ok) throw new Error('Save monthly report failed')

      const [year, month] = selectedMonth.split('-')
      const res2 = await fetch('/api/save-timeline-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          departmentId: deptId,
          postType: 'monthly_report',
          title: `${year}年${parseInt(month)}月 月次報告`,
          content: monthlyContent.slice(0, 2000),
        }),
      })
      if (!res2.ok) throw new Error('Timeline post failed')

      toast('月次報告をタイムラインに投稿しました', 'success')
      setMonthlyContent('')
    } catch {
      toast('月次報告の保存に失敗しました', 'error')
    } finally {
      setMonthlySubmitting(false)
    }
  }

  // ============================================================
  // Timeline: Comments
  // ============================================================

  const toggleComments = (postId: string) => {
    setExpandedComments(prev => {
      const next = new Set(prev)
      if (next.has(postId)) next.delete(postId)
      else next.add(postId)
      return next
    })
  }

  const toggleContent = (postId: string) => {
    setExpandedContent(prev => {
      const next = new Set(prev)
      if (next.has(postId)) next.delete(postId)
      else next.add(postId)
      return next
    })
  }

  const handlePostComment = async (postId: string) => {
    const content = commentInputs[postId]?.trim()
    if (!content || commentSubmitting) return
    setCommentSubmitting(postId)
    try {
      const res = await fetch('/api/save-timeline-comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, content }),
      })
      if (!res.ok) throw new Error('Comment save failed')
      setCommentInputs(prev => ({ ...prev, [postId]: '' }))
      toast('コメントを投稿しました', 'success')
      fetchTimeline()
    } catch {
      toast('コメントの投稿に失敗しました', 'error')
    } finally {
      setCommentSubmitting(null)
    }
  }

  // ============================================================
  // Gantt bar style
  // ============================================================

  const getBarStyle = useCallback((item: GanttActionItem) => {
    const totalDays = 365
    const start = new Date(item.start_date)
    const end = new Date(item.end_date)
    const startOffset = Math.max(0, (start.getTime() - ganttStartDate.getTime()) / (1000 * 60 * 60 * 24))
    const duration = Math.max(7, (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    const leftPct = (startOffset / totalDays) * 100
    const widthPct = (duration / totalDays) * 100
    const colors: Record<string, string> = {
      completed: '#22c55e',
      in_progress: '#3b82f6',
      delayed: '#ef4444',
      not_started: '#94a3b8',
      blocked: '#f97316',
    }
    return {
      left: `${leftPct}%`,
      width: `${Math.min(widthPct, 100 - leftPct)}%`,
      backgroundColor: colors[item.status] || '#94a3b8',
    }
  }, [ganttStartDate])

  // ============================================================
  // Render
  // ============================================================

  if (!project) return <div className="flex justify-center py-12"><Spinner /></div>

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'weekly', label: '週次報告' },
    { key: 'monthly', label: '月次報告' },
    { key: 'timeline', label: 'タイムライン' },
  ]

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900">進捗報告</h1>
        <p className="text-sm text-slate-500 mt-1">{department?.name || ''}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {tabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              'flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors',
              activeTab === tab.key
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ================================================================
          TAB 1: Weekly Report
          ================================================================ */}
      {activeTab === 'weekly' && (
        <div className="space-y-6">
          {/* Mini Gantt */}
          <Card>
            <CardTitle>アクションアイテム一覧</CardTitle>
            <p className="text-xs text-slate-400 mt-1">クリックしてアクションアイテムを選択し、報告を作成します</p>
            {loading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : actionItems.length === 0 ? (
              <EmptyState
                title="アクションアイテムがありません"
                description="まずアクションプランを作成してください"
              />
            ) : (
              <div className="mt-4 overflow-x-auto">
                <div className="min-w-[900px]">
                  {/* Month header row */}
                  <div className="flex items-center border-b border-slate-200 pb-2 mb-1">
                    <div className="w-52 flex-shrink-0 text-xs font-medium text-slate-500 pr-2">タスク名</div>
                    <div className="flex-1 flex">
                      {MONTH_LABELS.map(label => (
                        <div key={label} className="text-xs text-slate-400 text-center" style={{ width: `${100 / 12}%` }}>
                          {label}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Task rows */}
                  {actionItems.map(item => {
                    const isSelected = selectedItem?.id === item.id
                    return (
                      <div
                        key={item.id}
                        onClick={() => selectActionItem(item)}
                        className={cn(
                          'flex items-center py-2 px-1 rounded-lg cursor-pointer transition-colors',
                          isSelected
                            ? 'bg-blue-50 border-2 border-blue-400'
                            : 'hover:bg-slate-50 border-2 border-transparent'
                        )}
                      >
                        <div className="w-52 flex-shrink-0 pr-2">
                          <p className="text-sm font-medium text-slate-800 truncate">{item.title}</p>
                          <p className="text-xs text-slate-400 truncate">{item.planTitle}</p>
                        </div>
                        <div className="flex-1 relative h-8">
                          {/* Grid lines */}
                          <div className="absolute inset-0 flex">
                            {MONTH_LABELS.map((_, i) => (
                              <div key={i} className="border-l border-slate-100" style={{ width: `${100 / 12}%` }} />
                            ))}
                          </div>
                          {/* Bar */}
                          <div className="absolute top-1 h-6 rounded-md opacity-90" style={getBarStyle(item)}>
                            <div className="h-full rounded-md bg-white/30" style={{ width: `${item.progress_percent}%` }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </Card>

          {/* Report form (shown when item is selected) */}
          {selectedItem && (
            <Card>
              {/* Item header */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <CardTitle>{selectedItem.title}</CardTitle>
                  <p className="text-sm text-slate-500 mt-1">
                    {selectedItem.planTitle} / {formatDate(selectedItem.start_date)} 〜 {formatDate(selectedItem.end_date)}
                  </p>
                </div>
                <Badge variant={STATUS_BADGE[selectedItem.status]?.variant || 'default'}>
                  {STATUS_BADGE[selectedItem.status]?.label || selectedItem.status}
                </Badge>
              </div>

              {/* Mode toggle */}
              <div className="flex gap-2 mb-6">
                <button
                  onClick={() => setReportMode('form')}
                  className={cn(
                    'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                    reportMode === 'form' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  )}
                >
                  定型フォーマットで入力
                </button>
                <button
                  onClick={() => setReportMode('coach')}
                  className={cn(
                    'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                    reportMode === 'coach' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  )}
                >
                  AIコーチと対話
                </button>
              </div>

              {/* ---------- Form Mode ---------- */}
              {reportMode === 'form' && (
                <div className="space-y-4">
                  <Select
                    label="進捗ステータス"
                    options={STATUS_OPTIONS}
                    value={formStatus}
                    onChange={e => setFormStatus(e.target.value)}
                  />
                  <Textarea
                    label="アクションの計画"
                    placeholder="今週何をする予定でしたか？"
                    value={formPlanned}
                    onChange={e => setFormPlanned(e.target.value)}
                    rows={3}
                  />
                  <Textarea
                    label="実施内容"
                    placeholder="具体的に何を行いましたか？"
                    value={formActivities}
                    onChange={e => setFormActivities(e.target.value)}
                    rows={3}
                  />
                  <Textarea
                    label="気づき・学び"
                    placeholder="うまくいったこと、発見したことは？"
                    value={formReflections}
                    onChange={e => setFormReflections(e.target.value)}
                    rows={3}
                  />
                  <Textarea
                    label="課題"
                    placeholder="障害や困難はありますか？"
                    value={formChallenges}
                    onChange={e => setFormChallenges(e.target.value)}
                    rows={3}
                  />
                  <Textarea
                    label="ネクストアクション"
                    placeholder="次に取り組むことは？"
                    value={formNextActions}
                    onChange={e => setFormNextActions(e.target.value)}
                    rows={3}
                  />
                  <Input
                    label="期限"
                    type="date"
                    value={formDeadline}
                    onChange={e => setFormDeadline(e.target.value)}
                  />
                  <div className="flex justify-end gap-3 pt-2">
                    <Button variant="secondary" onClick={clearForm}>キャンセル</Button>
                    <Button onClick={handleSubmitWeekly} loading={submitting} disabled={submitting}>
                      タイムラインに投稿
                    </Button>
                  </div>
                </div>
              )}

              {/* ---------- Coach Mode ---------- */}
              {reportMode === 'coach' && (
                <div className="space-y-4">
                  {/* Chat messages */}
                  <div className="h-96 overflow-y-auto border border-slate-200 rounded-lg p-4 space-y-4 bg-slate-50">
                    {messages.map((msg, i) => (
                      <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                        <div
                          className={cn(
                            'max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap',
                            msg.role === 'user'
                              ? 'bg-blue-600 text-white rounded-br-md'
                              : 'bg-white text-slate-800 border border-slate-200 rounded-bl-md'
                          )}
                        >
                          {msg.role === 'user' && i === 0 ? (
                            <span className="text-blue-100 text-xs">(コンテキスト送信済み)</span>
                          ) : (
                            msg.content
                          )}
                        </div>
                      </div>
                    ))}
                    {aiLoading && (
                      <div className="flex justify-start">
                        <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-bl-md">
                          <div className="flex gap-1">
                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                            <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                          </div>
                        </div>
                      </div>
                    )}
                    <div ref={chatEndRef} />
                  </div>

                  {/* Input */}
                  {!coachDone && (
                    <div className="flex gap-2">
                      <Textarea
                        placeholder="メッセージを入力..."
                        value={userInput}
                        onChange={e => setUserInput(e.target.value)}
                        rows={2}
                        className="flex-1"
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            handleSendCoachMessage()
                          }
                        }}
                      />
                      <Button onClick={handleSendCoachMessage} disabled={aiLoading || !userInput.trim()} className="self-end">
                        送信
                      </Button>
                    </div>
                  )}
                  {coachDone && (
                    <p className="text-sm text-green-600 font-medium">
                      AIが報告をまとめました。「定型フォーマットで入力」に切り替わりました。内容を確認して投稿してください。
                    </p>
                  )}
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* ================================================================
          TAB 2: Monthly Report
          ================================================================ */}
      {activeTab === 'monthly' && (
        <div className="space-y-6">
          {/* Weekly reports list for this month */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <CardTitle>月次報告</CardTitle>
              <div className="w-48">
                <Select
                  options={monthOptions}
                  value={selectedMonth}
                  onChange={e => setSelectedMonth(e.target.value)}
                />
              </div>
            </div>

            {monthlyLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : monthlyReports.length === 0 ? (
              <EmptyState
                title="この月の週次報告はありません"
                description="週次報告タブから報告を作成してください"
              />
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-slate-500">{monthlyReports.length}件の週次報告</p>
                {monthlyReports.map(report => (
                  <div key={report.id} className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800">
                          {report.action_item?.title || '不明'}
                        </span>
                        <Badge variant={STATUS_BADGE[report.status]?.variant || 'default'}>
                          {STATUS_BADGE[report.status]?.label || report.status}
                        </Badge>
                      </div>
                      <span className="text-xs text-slate-400">
                        {report.submitted_at ? formatDate(report.submitted_at) : ''}
                      </span>
                    </div>
                    {report.activities_completed && (
                      <p className="text-sm text-slate-600 line-clamp-2">{report.activities_completed}</p>
                    )}
                    {report.challenges && (
                      <p className="text-sm text-slate-500 mt-1">
                        <span className="text-slate-400">課題: </span>{report.challenges}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Compile & Edit */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <CardTitle>月次報告書</CardTitle>
              <Button
                onClick={handleCompileMonthly}
                loading={monthlyAiLoading}
                disabled={monthlyAiLoading || monthlyReports.length === 0}
              >
                AIで月次報告を作成
              </Button>
            </div>
            {monthlyAiLoading && (
              <div className="flex justify-center py-8"><Spinner /></div>
            )}
            {monthlyContent && (
              <div className="space-y-4">
                <Textarea
                  value={monthlyContent}
                  onChange={e => setMonthlyContent(e.target.value)}
                  rows={16}
                  className="font-mono text-sm"
                />
                <div className="flex justify-end">
                  <Button
                    onClick={handleSubmitMonthly}
                    loading={monthlySubmitting}
                    disabled={monthlySubmitting || !monthlyContent.trim()}
                  >
                    タイムラインに投稿
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ================================================================
          TAB 3: Timeline
          ================================================================ */}
      {activeTab === 'timeline' && (
        <div className="space-y-4">
          {timelineLoading ? (
            <div className="flex justify-center py-12"><Spinner /></div>
          ) : timelinePosts.length === 0 ? (
            <EmptyState
              title="タイムラインに投稿がありません"
              description="週次報告や月次報告を投稿するとここに表示されます"
            />
          ) : (
            timelinePosts.map(post => {
              const profile = post.user_profile
              const initials = profile?.full_name ? profile.full_name.slice(0, 2) : '??'
              const postBadge = POST_TYPE_BADGE[post.post_type]
              const isContentExpanded = expandedContent.has(post.id)
              const contentLong = (post.content?.length || 0) > 200
              const commentsOpen = expandedComments.has(post.id)
              const commentCount = post.comments?.length || 0

              return (
                <Card key={post.id} className="hover:shadow-md transition-shadow">
                  {/* Header */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">
                          {profile?.full_name || '不明'}
                        </span>
                        {postBadge && (
                          <Badge variant={postBadge.variant}>{postBadge.label}</Badge>
                        )}
                        <span className="text-xs text-slate-400">{relativeTime(post.created_at)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="mb-3">
                    <p className="text-sm font-bold text-slate-900 mb-1">{post.title}</p>
                    {post.content && (
                      <div className="text-sm text-slate-600 whitespace-pre-wrap">
                        {contentLong && !isContentExpanded
                          ? post.content.slice(0, 200) + '...'
                          : post.content}
                        {contentLong && (
                          <button
                            onClick={() => toggleContent(post.id)}
                            className="text-blue-600 hover:text-blue-700 ml-1 text-xs font-medium"
                          >
                            {isContentExpanded ? '閉じる' : 'もっと見る'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="border-t border-slate-100 pt-2">
                    <button
                      onClick={() => toggleComments(post.id)}
                      className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      コメント{commentCount > 0 ? ` (${commentCount})` : ''}
                    </button>
                  </div>

                  {/* Comment thread */}
                  {commentsOpen && (
                    <div className="mt-3 border-t border-slate-100 pt-3 space-y-3">
                      {post.comments && post.comments.length > 0 ? (
                        post.comments.map(comment => {
                          const cp = comment.user_profile
                          const ci = cp?.full_name ? cp.full_name.slice(0, 2) : '??'
                          return (
                            <div key={comment.id} className="flex gap-2">
                              <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                {ci}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-slate-800">{cp?.full_name || '不明'}</span>
                                  <span className="text-xs text-slate-400">{relativeTime(comment.created_at)}</span>
                                </div>
                                <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{comment.content}</p>
                              </div>
                            </div>
                          )
                        })
                      ) : (
                        <p className="text-xs text-slate-400">コメントはまだありません</p>
                      )}

                      {/* Comment input */}
                      <div className="flex gap-2 pt-2">
                        <Textarea
                          placeholder="コメントを入力..."
                          value={commentInputs[post.id] || ''}
                          onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                          rows={2}
                          className="flex-1 text-sm"
                        />
                        <Button
                          onClick={() => handlePostComment(post.id)}
                          loading={commentSubmitting === post.id}
                          disabled={commentSubmitting === post.id || !(commentInputs[post.id]?.trim())}
                          className="self-end"
                        >
                          投稿
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              )
            })
          )}
        </div>
      )}
    </div>
  )
}
