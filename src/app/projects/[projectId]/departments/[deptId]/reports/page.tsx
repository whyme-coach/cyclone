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
  responsible_user_name?: string
  executor_user_name?: string
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
// OSKAR Phase
// ============================================================

const OSKAR_STEPS = [
  { key: 'outcome', label: 'Outcome', sub: '成果の確認', color: '#3b82f6' },
  { key: 'scaling', label: 'Scaling', sub: 'スケーリング', color: '#8b5cf6' },
  { key: 'knowhow', label: 'Know-how', sub: 'リソース', color: '#f59e0b' },
  { key: 'action', label: 'Action', sub: '肯定と行動', color: '#10b981' },
  { key: 'review', label: 'Review', sub: '振り返り', color: '#ef4444' },
] as const

function detectOskarPhase(messages: ChatMessage[]): number {
  const assistantMsgs = messages.filter(m => m.role === 'assistant')
  if (assistantMsgs.length === 0) return 0
  for (let i = assistantMsgs.length - 1; i >= 0; i--) {
    const content = assistantMsgs[i].content
    const match = content.match(/\[OSKAR:(outcome|scaling|knowhow|action|review)\]/i)
    if (match) {
      const phase = match[1].toLowerCase()
      if (phase === 'review') return 4
      if (phase === 'action') return 3
      if (phase === 'knowhow') return 2
      if (phase === 'scaling') return 1
      return 0
    }
  }
  const userRounds = messages.filter(m => m.role === 'user').length - 1
  if (userRounds <= 1) return 0
  if (userRounds <= 2) return 1
  if (userRounds <= 3) return 2
  if (userRounds <= 4) return 3
  return 4
}

function extractSuggestions(content: string): string[] {
  const matches = content.match(/\[SUGGEST:([^\]]+)\]/g)
  if (!matches) return []
  return matches.map(m => m.replace(/^\[SUGGEST:/, '').replace(/\]$/, '').trim()).filter(s => s.length > 0)
}

function stripTags(content: string): string {
  return content.replace(/\[OSKAR:[^\]]*\]/gi, '').replace(/\[SUGGEST:[^\]]*\]/gi, '').trim()
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
  const [weeklySubStep, setWeeklySubStep] = useState<'gantt' | 'form'>('gantt')
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
  const [monthlySections, setMonthlySections] = useState<{
    summary: string
    achievements: string
    challenges: string
    kpi_summary: string
    next_month_focus: string
    risk_alerts: string
    advice: string
  } | null>(null)
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

  // Week-based timeline (matching plans page)
  const WEEK_WIDTH = 48
  const fyStart = useMemo(() => new Date(fiscalYear, 3, 1), [fiscalYear])
  const fyEnd = useMemo(() => new Date(fiscalYear + 1, 2, 31), [fiscalYear])
  const weeks = useMemo(() => {
    const result: { start: Date; end: Date; label: string }[] = []
    const d = new Date(fyStart)
    const day = d.getDay()
    const diff = day === 0 ? 1 : day === 1 ? 0 : 8 - day
    d.setDate(d.getDate() + diff)
    while (d <= fyEnd) {
      const weekStart = new Date(d)
      const weekEnd = new Date(d)
      weekEnd.setDate(weekEnd.getDate() + 6)
      result.push({ start: weekStart, end: weekEnd, label: `${weekStart.getMonth() + 1}/${weekStart.getDate()}` })
      d.setDate(d.getDate() + 7)
    }
    return result
  }, [fyStart, fyEnd])
  const monthHeaders = useMemo(() => {
    const result: { label: string; spanWeeks: number }[] = []
    let currentMonth = -1, currentCount = 0
    for (const week of weeks) {
      const m = week.start.getMonth()
      if (m !== currentMonth) {
        if (currentMonth !== -1) result.push({ label: `${currentMonth + 1}月`, spanWeeks: currentCount })
        currentMonth = m; currentCount = 1
      } else { currentCount++ }
    }
    if (currentCount > 0) result.push({ label: `${currentMonth + 1}月`, spanWeeks: currentCount })
    return result
  }, [weeks])
  const todayWeekIndex = weeks.findIndex(w => { const t = new Date(); return t >= w.start && t <= w.end })
  const timelineWidth = weeks.length * WEEK_WIDTH

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
      const allItems: GanttActionItem[] = []
      for (const plan of data as (ActionPlan & { action_items: ActionItem[] })[]) {
        // Sort items within each plan by sort_order (same as plans page)
        const sortedItems = [...(plan.action_items || [])].sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
        for (const item of sortedItems) {
          allItems.push({ ...item, planTitle: plan.title, responsible_user_name: undefined, executor_user_name: undefined })
        }
      }

      // Fetch user profiles for responsible/executor
      const userIds = new Set<string>()
      for (const item of allItems) {
        if (item.responsible_user_id) userIds.add(item.responsible_user_id)
        if (item.executor_user_id) userIds.add(item.executor_user_id)
      }
      const nameMap: Record<string, string> = {}
      if (userIds.size > 0) {
        const { data: profiles } = await supabase.from('user_profiles').select('id, full_name').in('id', Array.from(userIds))
        if (profiles) for (const p of profiles) nameMap[p.id] = p.full_name || ''
      }

      for (const item of allItems) {
        if (item.responsible_user_id) item.responsible_user_name = nameMap[item.responsible_user_id]
        if (item.executor_user_id) item.executor_user_name = nameMap[item.executor_user_id]
      }
      // Keep plan order (created_at) + sort_order within plan — do NOT re-sort by date
      setActionItems(allItems)
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
      setWeeklySubStep('gantt')
      setActiveTab('timeline')
      fetchActionItems()
      fetchTimeline()
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
        const comp = company as { name?: string; industry?: string; business_description?: string } | null

        // Fetch department profile (strengths, challenges, technologies)
        let deptProfileStr = ''
        try {
          const { data: dp } = await supabase
            .from('department_profiles')
            .select('strengths, challenges, technologies, previous_year_initiatives')
            .eq('project_id', project!.id)
            .eq('department_id', deptId)
            .maybeSingle()
          if (dp) {
            const parts: string[] = []
            if (dp.strengths && Array.isArray(dp.strengths)) {
              parts.push('部門の強み: ' + (dp.strengths as Array<{title: string}>).map((s: {title: string}) => s.title).join('、'))
            }
            if (dp.challenges && Array.isArray(dp.challenges)) {
              parts.push('部門の課題: ' + (dp.challenges as Array<{title: string}>).map((c: {title: string}) => c.title).join('、'))
            }
            if (dp.technologies && Array.isArray(dp.technologies)) {
              parts.push('技術領域: ' + (dp.technologies as string[]).join('、'))
            }
            deptProfileStr = parts.join('\n')
          }
        } catch { /* ignore */ }

        // Fetch the action plan for this item (to get WOOP summary and all sibling items)
        let woopStr = ''
        let siblingItemsStr = ''
        try {
          const { data: plan } = await supabase
            .from('action_plans')
            .select('woop_summary, ai_advice, action_items(*)')
            .eq('id', selectedItem.action_plan_id)
            .single()
          if (plan) {
            const woop = plan.woop_summary as { wish?: string; obstacle?: string; plan?: string } | null
            if (woop) {
              const woopParts: string[] = []
              if (woop.wish) woopParts.push(`目標（Wish）: ${woop.wish}`)
              if (woop.obstacle) woopParts.push(`課題（Obstacle）: ${woop.obstacle}`)
              if (woop.plan) woopParts.push(`解決策（Plan）: ${woop.plan}`)
              woopStr = woopParts.join('\n')
            }
            if (plan.action_items && Array.isArray(plan.action_items)) {
              siblingItemsStr = (plan.action_items as ActionItem[])
                .sort((a: ActionItem, b: ActionItem) => a.sort_order - b.sort_order)
                .map((ai: ActionItem, idx: number) => `${idx + 1}. ${ai.title}（${ai.start_date} 〜 ${ai.end_date}、${ai.status === 'completed' ? '完了' : ai.status === 'in_progress' ? '進行中' : ai.status === 'delayed' ? '遅延' : '未着手'}）`)
                .join('\n')
            }
          }
        } catch { /* ignore */ }

        const contextMsg = `以下のアクションアイテムについて、週次報告を作成したいです。

【会社情報】
会社名: ${comp?.name || ''}
業種: ${comp?.industry || ''}
事業内容: ${comp?.business_description || ''}

【部門情報】
部門: ${department?.name || ''}
${deptProfileStr ? `${deptProfileStr}\n` : ''}
【アクションプランの背景（WOOPコーチング結果）】
${woopStr || '（未設定）'}

【このKPIのアクションアイテム一覧】
${siblingItemsStr || '（なし）'}

【今回の報告対象】
アクションアイテム: ${selectedItem.title}
説明: ${selectedItem.description || '（なし）'}
期間: ${selectedItem.start_date} 〜 ${selectedItem.end_date}
現在のステータス: ${STATUS_BADGE[selectedItem.status]?.label || selectedItem.status}
進捗: ${selectedItem.progress_percent}%

上記の背景を踏まえた上で、このアクションアイテムの週次報告を一緒に作成してください。`

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
        setMonthlySections({
          summary: parsed.summary || '',
          achievements: parsed.achievements?.join('\n') || '',
          challenges: parsed.challenges?.join('\n') || '',
          kpi_summary: parsed.kpi_summary || '',
          next_month_focus: parsed.next_month_focus?.join('\n') || '',
          risk_alerts: parsed.risk_alerts?.map(r => `[${r.level}] ${r.item}: ${r.recommendation}`).join('\n') || '',
          advice: parsed.advice || '',
        })
        setMonthlyContent('generated') // flag that content exists
      } else {
        const text = getAITextResponse(aiData) || '月次報告の生成に失敗しました'
        setMonthlySections({
          summary: text, achievements: '', challenges: '', kpi_summary: '', next_month_focus: '', risk_alerts: '', advice: '',
        })
        setMonthlyContent('generated')
      }
    } catch {
      toast('月次報告の生成に失敗しました', 'error')
    } finally {
      setMonthlyAiLoading(false)
    }
  }

  const handleSubmitMonthly = async () => {
    if (!project || !monthlySections) return
    setMonthlySubmitting(true)
    try {
      const res1 = await fetch('/api/save-monthly-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          departmentId: deptId,
          reportMonth: selectedMonth + '-01',
          content: { sections: monthlySections },
        }),
      })
      if (!res1.ok) throw new Error('Save monthly report failed')

      // Build structured content for timeline post
      const timelineContent = [
        monthlySections.summary ? `サマリー: ${monthlySections.summary}` : '',
        monthlySections.achievements ? `達成事項: ${monthlySections.achievements}` : '',
        monthlySections.challenges ? `課題: ${monthlySections.challenges}` : '',
        monthlySections.kpi_summary ? `KPI状況: ${monthlySections.kpi_summary}` : '',
        monthlySections.next_month_focus ? `来月の重点: ${monthlySections.next_month_focus}` : '',
        monthlySections.risk_alerts ? `リスク: ${monthlySections.risk_alerts}` : '',
        monthlySections.advice ? `アドバイス: ${monthlySections.advice}` : '',
      ].filter(Boolean).join('\n')

      const [year, month] = selectedMonth.split('-')
      const res2 = await fetch('/api/save-timeline-post', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          departmentId: deptId,
          postType: 'monthly_report',
          title: `${year}年${parseInt(month)}月 月次報告`,
          content: timelineContent,
        }),
      })
      if (!res2.ok) throw new Error('Timeline post failed')

      toast('月次報告をタイムラインに投稿しました', 'success')
      setMonthlyContent('')
      setMonthlySections(null)
      setActiveTab('timeline')
      fetchTimeline()
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
    const taskStart = new Date(item.start_date)
    const taskEnd = new Date(item.end_date)
    if (isNaN(taskStart.getTime()) || isNaN(taskEnd.getTime())) {
      return { position: 'absolute' as const, left: '0px', width: `${WEEK_WIDTH}px`, top: '4px', height: '20px', backgroundColor: '#94a3b8', borderRadius: '4px' }
    }
    let startIdx = weeks.findIndex(w => taskStart >= w.start && taskStart <= w.end)
    if (startIdx < 0) startIdx = weeks.findIndex(w => w.start >= taskStart)
    if (startIdx < 0) startIdx = 0
    let endIdx = weeks.findIndex(w => taskEnd >= w.start && taskEnd <= w.end)
    if (endIdx < 0) { if (taskEnd > weeks[weeks.length - 1]?.end) endIdx = weeks.length - 1; else endIdx = weeks.findIndex(w => w.end >= taskEnd) }
    if (endIdx < 0) endIdx = startIdx
    const safeStart = Math.max(0, Math.min(startIdx, weeks.length - 1))
    const safeEnd = Math.max(safeStart, Math.min(endIdx, weeks.length - 1))
    const left = safeStart * WEEK_WIDTH
    const width = Math.max(WEEK_WIDTH, (safeEnd - safeStart + 1) * WEEK_WIDTH - 4)
    const colors: Record<string, string> = {
      completed: '#22c55e', in_progress: '#3b82f6', delayed: '#f97316', not_started: '#94a3b8', blocked: '#ef4444',
    }
    return {
      position: 'absolute' as const, left: `${left + 2}px`, width: `${width}px`, top: '4px', height: '20px',
      backgroundColor: colors[item.status] || '#94a3b8', borderRadius: '4px',
    }
  }, [weeks])

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
      {activeTab === 'weekly' && weeklySubStep === 'gantt' && (
        <div className="space-y-6">
          {/* Mini Gantt grouped by KPI */}
          <Card padding={false}>
            <div className="p-4 pb-2">
              <CardTitle>アクションアイテム一覧</CardTitle>
              <p className="text-xs text-slate-400 mt-1">ダブルクリックで報告画面に移動します</p>
            </div>
            {loading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : actionItems.length === 0 ? (
              <div className="p-4"><EmptyState title="アクションアイテムがありません" description="まずアクションプランを作成してください" /></div>
            ) : (() => {
              // Group by planTitle — maintain plan order (same as plans page)
              const grouped = new Map<string, GanttActionItem[]>()
              for (const item of actionItems) {
                const list = grouped.get(item.planTitle) || []
                list.push(item)
                grouped.set(item.planTitle, list)
              }
              const groups = Array.from(grouped.entries())
              const ROW_HEIGHT = 36
              const LEFT_W = 400
              const totalRows = groups.reduce((acc, [, items]) => acc + items.length + 1, 0)

              return (
                <div style={{ display: 'flex', overflow: 'hidden', borderRadius: 8 }}>
                  {/* Left panel */}
                  <div style={{ width: LEFT_W, minWidth: LEFT_W, borderRight: '2px solid #e2e8f0', backgroundColor: '#fff', zIndex: 10 }}>
                    <div style={{ height: 52, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-end' }}>
                      <span style={{ width: 220, padding: '8px 16px' }} className="text-xs font-semibold text-slate-500">タスク</span>
                      <span style={{ width: 90, padding: '8px 4px' }} className="text-xs font-semibold text-slate-500">責任者</span>
                      <span style={{ width: 90, padding: '8px 4px' }} className="text-xs font-semibold text-slate-500">実行者</span>
                    </div>
                    {groups.map(([kpiName, items]) => (
                      <div key={kpiName}>
                        <div style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', padding: '0 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                          <span className="text-xs font-bold text-slate-700 truncate">{kpiName}</span>
                        </div>
                        {items.map(item => {
                          const isSelected = selectedItem?.id === item.id
                          return (
                            <div key={item.id}
                              onClick={() => setSelectedItem(item)}
                              onDoubleClick={() => { selectActionItem(item); setWeeklySubStep('form') }}
                              style={{ height: ROW_HEIGHT, display: 'flex', alignItems: 'center', borderBottom: '1px solid #f8fafc', cursor: 'pointer', backgroundColor: isSelected ? '#eff6ff' : 'transparent', borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent' }}
                              onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = '#f8fafc' }}
                              onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent' }}
                            >
                              <div style={{ width: 220, padding: '0 16px 0 24px', minWidth: 0 }}><p className="text-xs text-slate-700 truncate">{item.title}</p></div>
                              <div style={{ width: 90, padding: '0 4px' }}><span className="text-xs text-slate-500 truncate block">{item.responsible_user_name || '-'}</span></div>
                              <div style={{ width: 90, padding: '0 4px' }}><span className="text-xs text-slate-500 truncate block">{item.executor_user_name || '-'}</span></div>
                            </div>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                  {/* Right panel: week-based timeline */}
                  <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
                    <div style={{ width: timelineWidth, minWidth: '100%' }}>
                      {/* Month + Week header */}
                      <div style={{ height: 52, borderBottom: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', height: 26 }}>
                          {monthHeaders.map((mh, i) => (
                            <div key={i} style={{ width: mh.spanWeeks * WEEK_WIDTH, textAlign: 'center', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span className="text-xs font-medium text-slate-600">{mh.label}</span>
                            </div>
                          ))}
                        </div>
                        <div style={{ display: 'flex', height: 26 }}>
                          {weeks.map((w, i) => (
                            <div key={i} style={{ width: WEEK_WIDTH, textAlign: 'center', borderRight: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span className="text-[10px] text-slate-400">{w.label}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      {/* Timeline rows */}
                      <div style={{ position: 'relative' }}>
                        {todayWeekIndex >= 0 && (
                          <div style={{ position: 'absolute', left: todayWeekIndex * WEEK_WIDTH + WEEK_WIDTH / 2, top: 0, width: 2, backgroundColor: '#ef4444', zIndex: 5, height: totalRows * ROW_HEIGHT }} />
                        )}
                        {weeks.map((_, i) => (
                          <div key={i} style={{ position: 'absolute', left: i * WEEK_WIDTH, top: 0, width: 1, backgroundColor: '#f1f5f9', height: totalRows * ROW_HEIGHT }} />
                        ))}
                        {groups.map(([kpiName, items]) => (
                          <div key={kpiName}>
                            <div style={{ height: ROW_HEIGHT, backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }} />
                            {items.map(item => (
                              <div key={item.id} style={{ height: ROW_HEIGHT, position: 'relative', borderBottom: '1px solid #f8fafc' }}>
                                <div style={getBarStyle(item)}>
                                  <span style={{ fontSize: 10, color: '#fff', paddingLeft: 6, lineHeight: '20px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', pointerEvents: 'none' }}>{item.title}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}
          </Card>
        </div>
      )}

      {activeTab === 'weekly' && weeklySubStep === 'form' && selectedItem && (
        <div className="space-y-6">
          {/* Back to Gantt */}
          <Card className="bg-blue-50 border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-blue-600 font-medium">週次報告</p>
                <p className="text-sm font-semibold text-slate-900">{selectedItem.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {selectedItem.planTitle} / {formatDate(selectedItem.start_date)} 〜 {formatDate(selectedItem.end_date)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={STATUS_BADGE[selectedItem.status]?.variant || 'default'}>
                  {STATUS_BADGE[selectedItem.status]?.label || selectedItem.status}
                </Badge>
                <Button variant="secondary" size="sm" onClick={() => { setWeeklySubStep('gantt'); setReportMode('form'); setMessages([]); setUserInput(''); setCoachDone(false); fetchActionItems() }}>戻る</Button>
              </div>
            </div>
          </Card>

          <Card>

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

              {/* ---------- Coach Mode (OSKAR) ---------- */}
              {reportMode === 'coach' && (() => {
                const oskarPhase = detectOskarPhase(messages)
                const lastAiMsg = [...messages].reverse().find(m => m.role === 'assistant')
                const suggestions = lastAiMsg ? extractSuggestions(lastAiMsg.content) : []
                const lastIsAi = messages.length > 0 && messages[messages.length - 1]?.role === 'assistant'
                const showSuggestions = lastIsAi && !userInput.trim() && !aiLoading && suggestions.length > 0

                return (
                <div className="space-y-4">
                  {/* OSKAR Indicator */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4">
                    <div className="flex items-center gap-0">
                      {OSKAR_STEPS.map((step, i) => (
                        <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                            <div style={{
                              width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                              background: i < oskarPhase ? step.color : i === oskarPhase ? '#fff' : '#f1f5f9',
                              border: i === oskarPhase ? `2.5px solid ${step.color}` : i < oskarPhase ? 'none' : '2px solid #e2e8f0',
                              color: i < oskarPhase ? '#fff' : i === oskarPhase ? step.color : '#94a3b8',
                              fontSize: 13, fontWeight: 700,
                              boxShadow: i === oskarPhase ? `0 0 0 3px ${step.color}20` : 'none',
                              transition: 'all 0.5s ease',
                            }}>
                              {i < oskarPhase ? (
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                              ) : (
                                <span>{step.label[0]}</span>
                              )}
                            </div>
                            <p style={{ fontSize: 10, fontWeight: i === oskarPhase ? 700 : 500, color: i <= oskarPhase ? step.color : '#94a3b8', margin: '4px 0 0', transition: 'all 0.3s ease' }}>
                              {step.label}
                            </p>
                            <p style={{ fontSize: 9, color: i === oskarPhase ? '#475569' : '#cbd5e1', margin: '1px 0 0' }}>
                              {step.sub}
                            </p>
                          </div>
                          {i < OSKAR_STEPS.length - 1 && (
                            <div style={{ width: 32, height: 2, borderRadius: 1, background: i < oskarPhase ? OSKAR_STEPS[i + 1].color : '#e2e8f0', transition: 'background 0.5s ease', marginBottom: 24 }} />
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Chat messages */}
                  <div style={{ height: '45vh' }} className="overflow-y-auto border border-slate-200 rounded-lg p-4 space-y-4 bg-slate-50">
                    {messages.map((msg, i) => {
                      if (msg.role === 'user' && i === 0) return null
                      const displayContent = stripTags(msg.content)
                      return (
                        <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                          <div
                            className={cn(
                              'max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap',
                              msg.role === 'user'
                                ? 'bg-blue-600 text-white rounded-br-md'
                                : 'bg-white text-slate-800 border border-slate-200 rounded-bl-md'
                            )}
                          >
                            {displayContent}
                          </div>
                        </div>
                      )
                    })}
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

                  {/* Suggestion chips */}
                  {showSuggestions && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => setUserInput(s)}
                          style={{
                            padding: '6px 12px', fontSize: 12, color: '#3b82f6', background: '#eff6ff',
                            border: '1px solid #bfdbfe', borderRadius: 20, cursor: 'pointer', transition: 'all 0.15s',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe' }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff' }}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Input */}
                  {!coachDone && (
                    <div className="pt-3">
                      <div className="flex gap-2">
                        <textarea
                          className="flex-1 px-4 py-2.5 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400 resize-none"
                          placeholder="メッセージを入力..."
                          value={userInput}
                          onChange={e => setUserInput(e.target.value)}
                          rows={2}
                          disabled={aiLoading}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault()
                              handleSendCoachMessage()
                            }
                          }}
                        />
                        <button
                          onClick={handleSendCoachMessage}
                          disabled={aiLoading || !userInput.trim()}
                          className="px-5 py-2.5 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-stretch"
                        >
                          送信
                        </button>
                      </div>
                    </div>
                  )}
                  {coachDone && (
                    <p className="text-sm text-green-600 font-medium">
                      AIが報告をまとめました。「定型フォーマットで入力」に切り替わりました。内容を確認して投稿してください。
                    </p>
                  )}
                </div>
                )
              })()}
            </Card>
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
            {monthlySections && (
              <div className="space-y-4 mt-4">
                {/* Section editors */}
                {([
                  { key: 'summary', label: 'サマリー', rows: 3 },
                  { key: 'achievements', label: '達成事項', rows: 4 },
                  { key: 'challenges', label: '課題', rows: 4 },
                  { key: 'kpi_summary', label: 'KPI状況', rows: 3 },
                  { key: 'next_month_focus', label: '来月の重点事項', rows: 4 },
                  { key: 'risk_alerts', label: 'リスクアラート', rows: 3 },
                  { key: 'advice', label: 'アドバイス', rows: 3 },
                ] as const).map(({ key, label, rows }) => (
                  <div key={key}>
                    <p className="text-sm font-semibold text-slate-700 mb-1">{label}</p>
                    <textarea
                      className="w-full px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400 resize-vertical"
                      value={monthlySections[key]}
                      onChange={e => setMonthlySections(prev => prev ? { ...prev, [key]: e.target.value } : prev)}
                      rows={rows}
                    />
                  </div>
                ))}

                <div className="flex justify-end pt-2">
                  <Button
                    onClick={handleSubmitMonthly}
                    loading={monthlySubmitting}
                    disabled={monthlySubmitting}
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
              const postBadge = POST_TYPE_BADGE[post.post_type]
              const isContentExpanded = expandedContent.has(post.id)
              const commentsOpen = expandedComments.has(post.id)
              const commentCount = post.comments?.length || 0
              const acks = ((post.metadata as Record<string, unknown>)?.acks || []) as Array<{ user_id: string; name: string }>
              const hasAcked = acks.some(a => a.user_id === member?.user_id)

              // Parse content into structured sections
              const contentLines = (post.content || '').split('\n').filter(Boolean)

              return (
                <Card key={post.id}>
                  {/* Header: title + badge + time */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      {postBadge && (
                        <Badge variant={postBadge.variant}>{postBadge.label}</Badge>
                      )}
                      <h3 className="text-base font-bold text-slate-900 mt-1">{post.title}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {profile?.full_name || '不明'} ・ {relativeTime(post.created_at)}
                      </p>
                    </div>
                  </div>

                  {/* Content: structured display */}
                  {post.content && (
                    <div className="mt-3 bg-slate-50 rounded-lg p-4">
                      {(!isContentExpanded && contentLines.length > 4) ? (
                        <>
                          {contentLines.slice(0, 4).map((line, i) => {
                            const colonIdx = line.indexOf(':')
                            if (colonIdx > 0 && colonIdx < 15) {
                              const label = line.slice(0, colonIdx)
                              const value = line.slice(colonIdx + 1).trim()
                              return (
                                <div key={i} className="mb-2 last:mb-0">
                                  <span className="text-xs font-bold text-blue-600">{label}</span>
                                  <p className="text-sm text-slate-800 mt-0.5">{value}</p>
                                </div>
                              )
                            }
                            return <p key={i} className="text-sm text-slate-700 mb-1">{line}</p>
                          })}
                          <button onClick={() => toggleContent(post.id)} className="text-blue-600 hover:text-blue-700 text-xs font-medium mt-1">
                            もっと見る
                          </button>
                        </>
                      ) : (
                        <>
                          {contentLines.map((line, i) => {
                            const colonIdx = line.indexOf(':')
                            if (colonIdx > 0 && colonIdx < 15) {
                              const label = line.slice(0, colonIdx)
                              const value = line.slice(colonIdx + 1).trim()
                              return (
                                <div key={i} className="mb-2 last:mb-0">
                                  <span className="text-xs font-bold text-blue-600">{label}</span>
                                  <p className="text-sm text-slate-800 mt-0.5">{value}</p>
                                </div>
                              )
                            }
                            return <p key={i} className="text-sm text-slate-700 mb-1">{line}</p>
                          })}
                          {contentLines.length > 4 && (
                            <button onClick={() => toggleContent(post.id)} className="text-blue-600 hover:text-blue-700 text-xs font-medium mt-1">
                              閉じる
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* Footer: ack + comment buttons */}
                  <div className="flex items-center gap-4 mt-3 pt-2 border-t border-slate-100">
                    {/* Ack button */}
                    <div className="relative group">
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch('/api/toggle-timeline-ack', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ postId: post.id }),
                            })
                            if (res.ok) fetchTimeline()
                          } catch { /* ignore */ }
                        }}
                        className={cn(
                          'flex items-center gap-1.5 text-sm transition-colors',
                          hasAcked ? 'text-green-600' : 'text-slate-400 hover:text-green-600'
                        )}
                      >
                        <svg className="w-4 h-4" fill={hasAcked ? 'currentColor' : 'none'} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                        確認{acks.length > 0 ? ` (${acks.length})` : ''}
                      </button>
                      {/* Tooltip showing who acked */}
                      {acks.length > 0 && (
                        <div className="absolute bottom-full left-0 mb-2 hidden group-hover:block z-20">
                          <div className="bg-slate-800 text-white text-xs rounded-lg px-3 py-2 whitespace-nowrap shadow-lg">
                            <p className="font-semibold mb-1">確認済み:</p>
                            {acks.map((a, i) => (
                              <p key={i}>{a.name || '不明'}</p>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Comment button */}
                    <button
                      onClick={() => toggleComments(post.id)}
                      className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                      </svg>
                      コメント{commentCount > 0 ? ` (${commentCount})` : ''}
                    </button>
                  </div>

                  {/* Comment thread */}
                  {commentsOpen && (
                    <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                      {post.comments && post.comments.length > 0 ? (
                        post.comments.map(comment => {
                          const cp = comment.user_profile
                          return (
                            <div key={comment.id} className="pl-3 border-l-2 border-slate-200">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-700">{cp?.full_name || '不明'}</span>
                                <span className="text-xs text-slate-400">{relativeTime(comment.created_at)}</span>
                              </div>
                              <p className="text-sm text-slate-600 mt-0.5 whitespace-pre-wrap">{comment.content}</p>
                            </div>
                          )
                        })
                      ) : (
                        <p className="text-xs text-slate-400">コメントはまだありません</p>
                      )}

                      {/* Comment input */}
                      <div className="flex gap-2 pt-2">
                        <textarea
                          className="flex-1 px-3 py-2 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400 resize-none"
                          placeholder="コメントを入力..."
                          value={commentInputs[post.id] || ''}
                          onChange={e => setCommentInputs(prev => ({ ...prev, [post.id]: e.target.value }))}
                          rows={2}
                        />
                        <button
                          onClick={() => handlePostComment(post.id)}
                          disabled={commentSubmitting === post.id || !(commentInputs[post.id]?.trim())}
                          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors self-stretch"
                        >
                          投稿
                        </button>
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
