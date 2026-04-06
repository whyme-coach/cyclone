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
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { callAI, getAITextResponse, parseAIJsonResponse } from '@/lib/ai/helpers'
import { COACH_ACTION_PLAN_SYSTEM_PROMPT, COACH_ACTION_PLAN_USER_PROMPT } from '@/lib/ai/prompts/coach-action-plan'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { ACTION_ITEM_STATUS_LABELS } from '@/types/roles'
import type { ActionPlan, ActionItem, ActionItemStatus, KPI, ProjectMember } from '@/types'

// ---------- Types ----------

type Step = 1 | 2 | 3 | 4

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface DraftActionItem {
  id: string
  title: string
  description: string
  deliverable: string
  duration_weeks: number
  start_date: string
  end_date: string
}

interface GanttTask {
  id: string
  title: string
  description?: string
  start_date: string
  end_date: string
  status: ActionItemStatus
  progress_percent: number
  responsible_user_id?: string
  executor_user_id?: string
  deliverable?: string
  action_plan_id: string
  kpi_name: string
  responsible_user_name?: string
  executor_user_name?: string
}

// ---------- Main Component ----------

export default function ActionPlansPage() {
  const params = useParams()
  const projectId = params.projectId as string
  const deptId = params.deptId as string
  const { project, company, departments, member } = useProjectContext()
  const { toast } = useToast()
  const supabase = useMemo(() => createClient(), [])
  const department = departments.find(d => d.id === deptId)

  const [step, setStep] = useState<Step>(1)
  const [loading, setLoading] = useState(true)
  const [kpis, setKpis] = useState<KPI[]>([])
  const [plans, setPlans] = useState<(ActionPlan & { action_items: ActionItem[] })[]>([])
  const [selectedKpi, setSelectedKpi] = useState<KPI | null>(null)
  const [existingPlanForKpi, setExistingPlanForKpi] = useState<(ActionPlan & { action_items: ActionItem[] }) | null>(null)

  // Step 2 state
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [userInput, setUserInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [draftItems, setDraftItems] = useState<DraftActionItem[]>([])
  const [aiAdvice, setAiAdvice] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Step 4 state
  const [projectMembers, setProjectMembers] = useState<ProjectMember[]>([])
  const [ganttTasks, setGanttTasks] = useState<GanttTask[]>([])
  const [editingTask, setEditingTask] = useState<GanttTask | null>(null)
  const [showEditModal, setShowEditModal] = useState(false)

  // ---------- Data Fetching ----------

  const fetchData = useCallback(async () => {
    if (!project) return
    setLoading(true)
    const [kpiRes, planRes] = await Promise.all([
      supabase
        .from('kpis')
        .select('*')
        .eq('department_id', deptId)
        .eq('project_id', project.id)
        .order('created_at'),
      supabase
        .from('action_plans')
        .select('*, action_items(*)')
        .eq('department_id', deptId)
        .eq('project_id', project.id)
        .order('created_at'),
    ])
    if (kpiRes.data) setKpis(kpiRes.data)
    if (planRes.data) setPlans(planRes.data as (ActionPlan & { action_items: ActionItem[] })[])
    setLoading(false)
  }, [project, deptId, supabase])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ---------- Step 1: KPI Selection ----------

  const kpiPlanMap = useMemo(() => {
    const map = new Map<string, ActionPlan & { action_items: ActionItem[] }>()
    for (const plan of plans) {
      if (plan.kpi_id) map.set(plan.kpi_id, plan)
    }
    return map
  }, [plans])

  const allKpisHavePlans = useMemo(
    () => kpis.length > 0 && kpis.every(k => kpiPlanMap.has(k.id)),
    [kpis, kpiPlanMap]
  )
  const anyPlansExist = plans.length > 0

  const handleSelectKpi = (kpi: KPI) => {
    setSelectedKpi(kpi)
    const existing = kpiPlanMap.get(kpi.id) || null
    setExistingPlanForKpi(existing)
    if (existing) {
      // Already has a plan - go to Step 3 to view/edit
      const items: DraftActionItem[] = existing.action_items.map(ai => {
        // Calculate duration from dates
        const start = new Date(ai.start_date)
        const end = new Date(ai.end_date)
        const diffDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)))
        const durationWeeks = Math.max(1, Math.round(diffDays / 7))
        return {
          id: ai.id,
          title: ai.title,
          description: ai.description || '',
          deliverable: ai.deliverable || '',
          duration_weeks: durationWeeks,
          start_date: ai.start_date,
          end_date: ai.end_date,
        }
      })
      setDraftItems(items)
      if (existing.ai_advice) setAiAdvice(existing.ai_advice)
      setStep(3)
    } else {
      // No plan yet - start coaching
      setMessages([])
      setDraftItems([])
      setExistingPlanForKpi(null)
      setStep(2)
    }
  }

  // ---------- Step 2: AI Coach Chat ----------

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Auto-send first message on Step 2 mount
  useEffect(() => {
    if (step !== 2 || !selectedKpi || messages.length > 0) return
    const sendInitial = async () => {
      setAiLoading(true)
      try {
        const fiscalYear = project?.fiscal_year || new Date().getFullYear()

        // Fetch context data: goals, strategies, measures, dept profile
        const [goalsRes, stratRes, measRes, deptProfileRes] = await Promise.all([
          supabase.from('management_goals').select('title, target_value, target_unit, type').eq('project_id', project!.id).order('sort_order'),
          supabase.from('strategies').select('title').eq('project_id', project!.id).order('sort_order'),
          supabase.from('measures').select('title, description').eq('project_id', project!.id).eq('department_id', deptId).order('sort_order'),
          supabase.from('department_profiles').select('strengths, challenges, technologies, previous_year_initiatives, previous_year_summary').eq('project_id', project!.id).eq('department_id', deptId).maybeSingle(),
        ])
        const goalsStr = goalsRes.data?.map((g: { title: string; target_value?: string; target_unit?: string; type: string }) => `${g.title}${g.target_value ? `（${g.target_value}${g.target_unit || ''}）` : ''} [${g.type}]`).join('\n') || ''
        const stratStr = stratRes.data?.map((s: { title: string }) => s.title).join('\n') || ''
        const measStr = measRes.data?.map((m: { title: string; description?: string }) => `${m.title}${m.description ? `: ${m.description}` : ''}`).join('\n') || ''

        // Build department profile context string
        let deptProfileStr = ''
        const dp = deptProfileRes.data
        if (dp) {
          const parts: string[] = []
          if (dp.strengths && Array.isArray(dp.strengths)) {
            parts.push('部門の強み:\n' + (dp.strengths as Array<{title: string; detail: string}>).map((s: {title: string; detail: string}) => `${s.title}: ${s.detail}`).join('\n'))
          }
          if (dp.challenges && Array.isArray(dp.challenges)) {
            parts.push('部門の課題:\n' + (dp.challenges as Array<{title: string; detail: string}>).map((c: {title: string; detail: string}) => `${c.title}: ${c.detail}`).join('\n'))
          }
          if (dp.technologies && Array.isArray(dp.technologies)) {
            parts.push('技術領域・ツール: ' + (dp.technologies as string[]).join(', '))
          }
          if (dp.previous_year_initiatives && Array.isArray(dp.previous_year_initiatives)) {
            parts.push('過年度の施策実績:\n' + (dp.previous_year_initiatives as Array<{title: string; status: string; detail: string}>).map((i: {title: string; status: string; detail: string}) => `${i.title}（${i.status === 'achieved' ? '達成' : '未達'}）: ${i.detail}`).join('\n'))
          }
          deptProfileStr = parts.join('\n\n')
        }

        const comp = company as { name?: string; industry?: string; business_description?: string } | null
        const userPrompt = COACH_ACTION_PLAN_USER_PROMPT({
          kpiName: selectedKpi.name,
          kpiDescription: selectedKpi.description || '',
          kpiTarget: String(selectedKpi.target_value || ''),
          kpiUnit: selectedKpi.target_unit || '',
          kpiPreviousMax: String(selectedKpi.previous_year_max || ''),
          departmentName: department?.name || '',
          fiscalYear,
          companyName: comp?.name || '',
          industry: comp?.industry || '',
          businessDescription: comp?.business_description || '',
          goals: goalsStr,
          strategies: stratStr,
          measures: measStr,
          deptProfile: deptProfileStr,
        })
        const initialUserMsg: ChatMessage = {
          role: 'user',
          content: userPrompt,
          timestamp: new Date().toISOString(),
        }
        const aiData = await callAI('coach-action-plan', {
          system: COACH_ACTION_PLAN_SYSTEM_PROMPT,
          messages: [{ role: 'user', content: userPrompt }],
        })
        const aiText = getAITextResponse(aiData)
        const aiMsg: ChatMessage = {
          role: 'assistant',
          content: aiText,
          timestamp: new Date().toISOString(),
        }
        setMessages([initialUserMsg, aiMsg])
        checkForActionItems(aiData)
      } catch {
        toast('AIコーチの起動に失敗しました', 'error')
      } finally {
        setAiLoading(false)
      }
    }
    sendInitial()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, selectedKpi])

  const checkForActionItems = (aiData: unknown) => {
    const parsed = parseAIJsonResponse(aiData) as {
      ready?: boolean
      advice?: string
      action_items?: Array<{
        title: string; description?: string; deliverable?: string
        duration_weeks?: number; start_date?: string; end_date?: string
      }>
    } | null
    if (parsed?.ready && parsed.action_items) {
      const items: DraftActionItem[] = parsed.action_items.map((item, i) => ({
        id: `draft-${i}`,
        title: item.title,
        description: item.description || '',
        deliverable: item.deliverable || '',
        duration_weeks: item.duration_weeks || 2,
        start_date: item.start_date || '',
        end_date: item.end_date || '',
      }))
      setDraftItems(items)
      if (parsed.advice) setAiAdvice(parsed.advice)
      setStep(3)
    }
  }

  const handleSendMessage = async () => {
    if (!userInput.trim() || aiLoading) return
    const userMsg: ChatMessage = {
      role: 'user',
      content: userInput.trim(),
      timestamp: new Date().toISOString(),
    }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setUserInput('')
    setAiLoading(true)
    try {
      const aiData = await callAI('coach-action-plan', {
        system: COACH_ACTION_PLAN_SYSTEM_PROMPT,
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
      })
      const aiText = getAITextResponse(aiData)
      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: aiText,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, aiMsg])
      checkForActionItems(aiData)
    } catch {
      toast('メッセージの送信に失敗しました', 'error')
    } finally {
      setAiLoading(false)
    }
  }

  const handleFinishCoaching = async () => {
    if (aiLoading) return
    const finishPrompt = 'これまでの対話内容をもとに、具体的なアクションアイテムをJSON形式でまとめてください。ready: true を含めてください。'
    const userMsg: ChatMessage = {
      role: 'user',
      content: finishPrompt,
      timestamp: new Date().toISOString(),
    }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setAiLoading(true)
    try {
      const aiData = await callAI('coach-action-plan', {
        system: COACH_ACTION_PLAN_SYSTEM_PROMPT,
        messages: newMessages.map(m => ({ role: m.role, content: m.content })),
      })
      const aiText = getAITextResponse(aiData)
      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: aiText,
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, aiMsg])
      checkForActionItems(aiData)
    } catch {
      toast('コーチング完了の処理に失敗しました', 'error')
    } finally {
      setAiLoading(false)
    }
  }

  const saveConversationLog = useCallback(async () => {
    if (!selectedKpi || messages.length === 0) return
    try {
      await supabase.from('ai_conversation_logs').insert({
        project_id: projectId,
        user_id: member?.user_id || '',
        context_type: 'action_plan_suggestion',
        context_id: selectedKpi.id,
        messages: messages.map(m => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp,
        })),
      })
    } catch {
      // silent fail for logging
    }
  }, [selectedKpi, messages, supabase, projectId, member])

  // ---------- Step 3: Action Item Editing ----------

  const handleUpdateDraftItem = (id: string, updates: Partial<DraftActionItem>) => {
    setDraftItems(prev => prev.map(item => item.id === id ? { ...item, ...updates } : item))
  }

  const handleAddDraftItem = () => {
    setDraftItems(prev => [
      ...prev,
      {
        id: `draft-${Date.now()}`,
        title: '',
        description: '',
        deliverable: '',
        duration_weeks: 2,
        start_date: '',
        end_date: '',
      },
    ])
  }

  const handleRemoveDraftItem = (id: string) => {
    setDraftItems(prev => prev.filter(item => item.id !== id))
  }

  const handleReorderDraftItem = (fromIndex: number, toIndex: number) => {
    setDraftItems(prev => {
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const handleSaveActionPlan = async () => {
    if (!project || !selectedKpi || draftItems.length === 0) return
    try {
      // Extract WOOP summary from chat messages
      const woopSummary = extractWoopSummary(messages)
      const summaryData = (woopSummary.wish || woopSummary.obstacle) ? {
        wish: woopSummary.wish || undefined,
        obstacle: woopSummary.obstacle || undefined,
        plan: `${draftItems.length}つのアクションで対処`,
      } : undefined

      const res = await fetch('/api/save-action-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: project.id,
          departmentId: deptId,
          kpiId: selectedKpi.id,
          title: selectedKpi.name,
          fiscalYear: project.fiscal_year,
          items: draftItems,
          existingPlanId: existingPlanForKpi?.id || null,
          woopSummary: summaryData || existingPlanForKpi?.woop_summary || null,
          aiAdvice: aiAdvice || existingPlanForKpi?.ai_advice || null,
        }),
      })
      if (!res.ok) throw new Error('Save failed')

      toast(existingPlanForKpi ? 'アクションプランを更新しました' : 'アクションプランを保存しました', 'success')

      // Post to timeline
      try {
        await fetch('/api/save-timeline-post', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: project.id,
            departmentId: deptId,
            postType: 'plan_change',
            title: `${selectedKpi.name}のアクションプランを${existingPlanForKpi ? '更新' : '作成'}しました`,
            content: `${draftItems.length}件のアクションアイテム`,
          }),
        })
      } catch { /* ignore timeline post errors */ }

      // Save conversation log if we came from coaching
      await saveConversationLog()

      // Refresh data and go back to Step 1
      await fetchData()
      setStep(1)
      setSelectedKpi(null)
      setDraftItems([])
      setMessages([])
    } catch {
      toast('保存に失敗しました', 'error')
    }
  }

  // ---------- Step 4: Gantt Chart ----------

  const fetchGanttData = useCallback(async () => {
    if (!project) return
    setLoading(true)

    // Fetch plans with items (no FK join for user_profiles - FK goes via auth.users)
    const planRes = await supabase
      .from('action_plans')
      .select('*, action_items(*)')
      .eq('department_id', deptId)
      .eq('project_id', project.id)

    // Fetch project members separately, then user_profiles
    const memberRes = await supabase
      .from('project_members')
      .select('*')
      .eq('project_id', projectId)

    let membersWithProfiles: ProjectMember[] = []
    if (memberRes.data && memberRes.data.length > 0) {
      const userIds = memberRes.data.map((m: { user_id: string }) => m.user_id)
      const { data: profiles } = await supabase
        .from('user_profiles')
        .select('*')
        .in('id', userIds)
      const profileMap = Object.fromEntries((profiles || []).map((p: { id: string; full_name?: string }) => [p.id, p]))
      membersWithProfiles = memberRes.data.map((m: ProjectMember) => ({
        ...m,
        user_profile: profileMap[m.user_id] || undefined,
      }))
    }
    setProjectMembers(membersWithProfiles)

    // Build user name lookup from profiles
    const userNameMap: Record<string, string> = {}
    for (const m of membersWithProfiles) {
      if (m.user_profile?.full_name) userNameMap[m.user_id] = m.user_profile.full_name
    }

    if (planRes.data) {
      const tasks: GanttTask[] = []
      for (const plan of planRes.data as (ActionPlan & { action_items: ActionItem[] })[]) {
        const kpi = kpis.find(k => k.id === plan.kpi_id)
        for (const item of plan.action_items || []) {
          tasks.push({
            id: item.id,
            title: item.title,
            description: item.description,
            start_date: item.start_date,
            end_date: item.end_date,
            status: item.status,
            progress_percent: item.progress_percent,
            responsible_user_id: item.responsible_user_id || undefined,
            executor_user_id: item.executor_user_id || undefined,
            deliverable: item.deliverable,
            action_plan_id: item.action_plan_id,
            kpi_name: kpi?.name || plan.title,
            responsible_user_name: ((item as unknown as Record<string, string>).responsible_name) || (item.responsible_user_id ? userNameMap[item.responsible_user_id] : undefined),
            executor_user_name: ((item as unknown as Record<string, string>).executor_name) || (item.executor_user_id ? userNameMap[item.executor_user_id] : undefined),
          })
        }
      }
      setGanttTasks(tasks)
    }
    setLoading(false)
  }, [project, deptId, projectId, supabase, kpis])

  const handleGoToGantt = () => {
    setStep(4)
    fetchGanttData()
  }

  const handleSaveTask = async (task: GanttTask) => {
    try {
      const updateData: Record<string, unknown> = {
        title: task.title,
        description: task.description,
        start_date: task.start_date,
        end_date: task.end_date,
        status: task.status,
        deliverable: task.deliverable,
        responsible_user_id: task.responsible_user_id || null,
        executor_user_id: task.executor_user_id || null,
      }
      if (task.responsible_user_name !== undefined) updateData.responsible_name = task.responsible_user_name || null
      if (task.executor_user_name !== undefined) updateData.executor_name = task.executor_user_name || null
      await supabase
        .from('action_items')
        .update(updateData)
        .eq('id', task.id)
      setGanttTasks(prev => prev.map(t => t.id === task.id ? task : t))
      toast('更新しました', 'success')
      setShowEditModal(false)
      setEditingTask(null)
    } catch {
      toast('更新に失敗しました', 'error')
    }
  }

  const handleUpdateTaskDates = async (taskId: string, startDate: string, endDate: string) => {
    try {
      await supabase.from('action_items').update({ start_date: startDate, end_date: endDate }).eq('id', taskId)
      setGanttTasks(prev => prev.map(t => t.id === taskId ? { ...t, start_date: startDate, end_date: endDate } : t))
    } catch {
      toast('更新に失敗しました', 'error')
    }
  }

  // ---------- Render ----------

  if (loading && step !== 4) {
    return (
      <div className="flex justify-center py-12">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-slate-900">アクションプラン作成</h2>
        <p className="text-sm text-slate-500 mt-1">{department?.name}</p>
      </div>

      {/* Step 1: KPI Selection */}
      {step === 1 && (
        <Step1KPISelection
          kpis={kpis}
          kpiPlanMap={kpiPlanMap}
          allKpisHavePlans={allKpisHavePlans}
          anyPlansExist={anyPlansExist}
          onSelectKpi={handleSelectKpi}
          onGoToGantt={handleGoToGantt}
        />
      )}

      {/* Step 2: AI Coach Chat */}
      {step === 2 && selectedKpi && (
        <Step2CoachChat
          kpi={selectedKpi}
          messages={messages}
          userInput={userInput}
          aiLoading={aiLoading}
          chatEndRef={chatEndRef}
          onSetUserInput={setUserInput}
          onSendMessage={handleSendMessage}
          onFinishCoaching={handleFinishCoaching}
          onBack={() => { setStep(1); setMessages([]); setSelectedKpi(null) }}
        />
      )}

      {/* Step 3: Action Item Editing */}
      {step === 3 && selectedKpi && (
        <Step3EditItems
          kpi={selectedKpi}
          items={draftItems}
          isUpdate={!!existingPlanForKpi}
          messages={messages}
          savedWoopSummary={existingPlanForKpi?.woop_summary as { wish?: string; obstacle?: string; plan?: string } | undefined}
          aiAdvice={aiAdvice || existingPlanForKpi?.ai_advice || ''}
          onUpdateItem={handleUpdateDraftItem}
          onAddItem={handleAddDraftItem}
          onRemoveItem={handleRemoveDraftItem}
          onReorderItem={handleReorderDraftItem}
          onSave={handleSaveActionPlan}
          onRecoach={() => {
            setMessages([])
            setDraftItems([])
            setAiAdvice('')
            setStep(2)
          }}
          onBack={() => {
            if (existingPlanForKpi) {
              setStep(1)
              setSelectedKpi(null)
            } else {
              setStep(2)
            }
          }}
        />
      )}

      {/* Step 4: Gantt Chart */}
      {step === 4 && (
        <>
          {loading ? (
            <div className="flex justify-center py-12"><Spinner size="lg" /></div>
          ) : (
            <Step4GanttChart
              tasks={ganttTasks}
              fiscalYear={project?.fiscal_year || new Date().getFullYear()}
              members={projectMembers}
              onEditTask={(task) => { setEditingTask(task); setShowEditModal(true) }}
              onUpdateTaskDates={handleUpdateTaskDates}
              onBack={() => setStep(1)}
            />
          )}
          {showEditModal && editingTask && (
            <TaskEditModal
              task={editingTask}
              onSave={handleSaveTask}
              onClose={() => { setShowEditModal(false); setEditingTask(null) }}
            />
          )}
        </>
      )}
    </div>
  )
}

// ========== Step 1: KPI Selection ==========

function Step1KPISelection({
  kpis,
  kpiPlanMap,
  allKpisHavePlans,
  anyPlansExist,
  onSelectKpi,
  onGoToGantt,
}: {
  kpis: KPI[]
  kpiPlanMap: Map<string, ActionPlan & { action_items: ActionItem[] }>
  allKpisHavePlans: boolean
  anyPlansExist: boolean
  onSelectKpi: (kpi: KPI) => void
  onGoToGantt: () => void
}) {
  if (kpis.length === 0) {
    return (
      <Card>
        <EmptyState
          title="KPIが設定されていません"
          description="先にKPIを設定してから、アクションプランを作成してください"
        />
      </Card>
    )
  }

  return (
    <>
      {allKpisHavePlans && (
        <Card className="bg-green-50 border-green-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-green-800">全てのKPIにアクションプランが作成されています</p>
              <p className="text-xs text-green-600 mt-1">ガントチャートで全体のスケジュールを確認できます</p>
            </div>
            <Button onClick={onGoToGantt}>ガントチャートを表示</Button>
          </div>
        </Card>
      )}

      {!allKpisHavePlans && anyPlansExist && (
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onGoToGantt}>ガントチャートを表示</Button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {kpis.map(kpi => {
          const hasPlan = kpiPlanMap.has(kpi.id)
          return (
            <Card
              key={kpi.id}
              className={cn(
                'cursor-pointer transition-shadow hover:shadow-md',
                hasPlan ? 'border-green-200' : 'border-slate-200'
              )}
              onClick={() => onSelectKpi(kpi)}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-semibold text-slate-900 flex-1 min-w-0 mr-2">{kpi.name}</h3>
                {hasPlan ? (
                  <Badge variant="success">作成済み</Badge>
                ) : (
                  <Badge variant="info">プラン未作成</Badge>
                )}
              </div>
              {(kpi.target_value !== null && kpi.target_value !== undefined) && (
                <p className="text-sm text-blue-700 font-medium mb-1">
                  目標: {kpi.target_value} {kpi.target_unit || ''}
                </p>
              )}
              {kpi.description && (
                <p className="text-xs text-slate-500 line-clamp-2">{kpi.description}</p>
              )}
            </Card>
          )
        })}
      </div>
    </>
  )
}

// ========== Step 2: AI Coach Chat ==========

const WOOP_STEPS = [
  { key: 'wish', label: 'Wish', sub: '願望の具体化', color: '#3b82f6', desc: 'KPIを自分ごとの願望に' },
  { key: 'outcome', label: 'Outcome', sub: '成果イメージ', color: '#8b5cf6', desc: '五感レベルで成功を描写' },
  { key: 'obstacle', label: 'Obstacle', sub: '障害の特定', color: '#f59e0b', desc: '内的・外的障害を深掘り' },
  { key: 'plan', label: 'Plan', sub: 'if-thenプラン', color: '#10b981', desc: '障害→具体的行動計画' },
] as const

function detectWoopPhase(messages: ChatMessage[]): number {
  // Primary: look for [WOOP:phase] tag in AI responses (mandatory per system prompt)
  const assistantMsgs = messages.filter(m => m.role === 'assistant')
  if (assistantMsgs.length === 0) return 0

  // Scan from latest message backwards to find the most recent phase tag
  for (let i = assistantMsgs.length - 1; i >= 0; i--) {
    const content = assistantMsgs[i].content
    // Case-insensitive match for robustness
    const match = content.match(/\[WOOP:(wish|outcome|obstacle|plan)\]/i)
    if (match) {
      const phase = match[1].toLowerCase()
      if (phase === 'plan') return 3
      if (phase === 'obstacle') return 2
      if (phase === 'outcome') return 1
      return 0
    }
  }

  // Fallback: conservative estimate by user exchange rounds (excluding initial prompt)
  const userRounds = messages.filter(m => m.role === 'user').length - 1
  if (userRounds <= 2) return 0   // Wish: first 1-2 exchanges
  if (userRounds <= 4) return 1   // Outcome: 3-4 exchanges
  if (userRounds <= 6) return 2   // Obstacle: 5-6 exchanges
  return 3                        // Plan: 7+ exchanges
}

function WoopIndicator({ currentPhase }: { currentPhase: number }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: '16px 20px 12px', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      {/* Step circles + connectors */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
        {WOOP_STEPS.map((step, i) => (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
              {/* Circle */}
              <div style={{
                width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: i < currentPhase ? step.color : i === currentPhase ? '#fff' : '#f1f5f9',
                border: i === currentPhase ? `2.5px solid ${step.color}` : i < currentPhase ? 'none' : '2px solid #e2e8f0',
                color: i < currentPhase ? '#fff' : i === currentPhase ? step.color : '#94a3b8',
                fontSize: 15, fontWeight: 700,
                boxShadow: i === currentPhase ? `0 0 0 4px ${step.color}20, 0 2px 8px ${step.color}30` : 'none',
                transition: 'all 0.5s ease',
              }}>
                {i < currentPhase ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <span>{step.label[0]}</span>
                )}
              </div>
              {/* Label */}
              <p style={{ fontSize: 11, fontWeight: i === currentPhase ? 700 : 500, color: i <= currentPhase ? step.color : '#94a3b8', margin: '6px 0 0', transition: 'all 0.3s ease' }}>
                {step.label}
              </p>
              <p style={{ fontSize: 10, color: i === currentPhase ? '#475569' : '#cbd5e1', margin: '1px 0 0', transition: 'all 0.3s ease' }}>
                {step.sub}
              </p>
            </div>
            {/* Connector line */}
            {i < WOOP_STEPS.length - 1 && (
              <div style={{ flex: '0 0 auto', width: 48, height: 2.5, borderRadius: 2, background: i < currentPhase ? WOOP_STEPS[i + 1].color : '#e2e8f0', transition: 'background 0.5s ease', marginBottom: 28 }} />
            )}
          </div>
        ))}
      </div>
      {/* Current phase description */}
      <div style={{ textAlign: 'center', marginTop: 8, padding: '6px 12px', background: `${WOOP_STEPS[currentPhase].color}08`, borderRadius: 8, transition: 'all 0.3s ease' }}>
        <p style={{ fontSize: 11, color: WOOP_STEPS[currentPhase].color, fontWeight: 600, margin: 0 }}>
          {WOOP_STEPS[currentPhase].desc}
        </p>
      </div>
    </div>
  )
}

function extractSuggestions(content: string): string[] {
  const matches = content.match(/\[SUGGEST:([^\]]+)\]/g)
  if (!matches) return []
  return matches.map(m => m.replace(/^\[SUGGEST:/, '').replace(/\]$/, '').trim()).filter(s => s.length > 0)
}

function stripSuggestTags(content: string): string {
  return content.replace(/\[SUGGEST:[^\]]*\]/g, '').trim()
}

function Step2CoachChat({
  kpi,
  messages,
  userInput,
  aiLoading,
  chatEndRef,
  onSetUserInput,
  onSendMessage,
  onFinishCoaching,
  onBack,
}: {
  kpi: KPI
  messages: ChatMessage[]
  userInput: string
  aiLoading: boolean
  chatEndRef: React.RefObject<HTMLDivElement | null>
  onSetUserInput: (v: string) => void
  onSendMessage: () => void
  onFinishCoaching: () => void
  onBack: () => void
}) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSendMessage()
    }
  }

  const woopPhase = detectWoopPhase(messages)

  // Extract AI-generated suggestions from the latest assistant message
  const lastAiMsg = [...messages].reverse().find(m => m.role === 'assistant')
  const suggestions = lastAiMsg ? extractSuggestions(lastAiMsg.content) : []

  // Only show suggestions when AI has responded, user hasn't typed yet, and suggestions exist
  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null
  const showSuggestions = lastMsg?.role === 'assistant' && !userInput.trim() && !aiLoading && suggestions.length > 0

  return (
    <>
      {/* KPI info header */}
      <Card className="bg-blue-50 border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-blue-600 font-medium">対象KPI</p>
            <p className="text-sm font-semibold text-slate-900">{kpi.name}</p>
            {kpi.target_value !== null && kpi.target_value !== undefined && (
              <p className="text-xs text-slate-600 mt-0.5">目標: {kpi.target_value} {kpi.target_unit || ''}</p>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={onBack}>戻る</Button>
        </div>
      </Card>

      {/* WOOP Indicator */}
      <WoopIndicator currentPhase={woopPhase} />

      {/* Chat area */}
      <Card padding={false} className="flex flex-col" style={{ height: '55vh' }}>
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.filter(m => m.role === 'assistant' || messages.indexOf(m) > 0).map((msg, i) => {
            if (msg.role === 'user' && messages.indexOf(msg) === 0) return null
            // Strip [WOOP:...] and [SUGGEST:...] tags from display
            const displayContent = stripSuggestTags(msg.content.replace(/\[WOOP:(wish|outcome|obstacle|plan)\]/gi, ''))
            return (
              <div
                key={i}
                className={cn(
                  'flex',
                  msg.role === 'user' ? 'justify-end' : 'justify-start'
                )}
              >
                <div
                  className={cn(
                    'max-w-[80%] rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap',
                    msg.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-slate-100 text-slate-800'
                  )}
                >
                  {displayContent}
                </div>
              </div>
            )
          })}
          {aiLoading && (
            <div className="flex justify-start">
              <div className="bg-slate-100 rounded-2xl px-4 py-3">
                <Spinner size="sm" />
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>

        {/* Suggestion chips */}
        {showSuggestions && (
          <div style={{ padding: '8px 16px 0', display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSetUserInput(s)}
                style={{
                  padding: '6px 12px',
                  fontSize: 12,
                  color: '#3b82f6',
                  background: '#eff6ff',
                  border: '1px solid #bfdbfe',
                  borderRadius: 20,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  whiteSpace: 'nowrap' as const,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#dbeafe'; e.currentTarget.style.borderColor = '#93c5fd' }}
                onMouseLeave={e => { e.currentTarget.style.background = '#eff6ff'; e.currentTarget.style.borderColor = '#bfdbfe' }}
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="border-t border-slate-200 p-4" style={{ marginTop: showSuggestions ? 8 : 0 }}>
          <div className="flex gap-2">
            <div className="flex-1">
              <textarea
                className="w-full px-4 py-2.5 text-sm text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent placeholder:text-slate-400 resize-none"
                rows={2}
                value={userInput}
                onChange={e => onSetUserInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="メッセージを入力..."
                disabled={aiLoading}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button
                size="sm"
                onClick={onSendMessage}
                disabled={!userInput.trim() || aiLoading}
              >
                送信
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={onFinishCoaching}
                disabled={aiLoading || messages.length < 4}
              >
                コーチング完了
              </Button>
            </div>
          </div>
        </div>
      </Card>
    </>
  )
}

// ========== Step 3: Action Item Editing ==========

function toWeekLabel(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  const m = d.getMonth() + 1
  const day = d.getDate()
  const week = Math.ceil(day / 7)
  return `${m}月${week}週`
}

function extractWoopSummary(messages: ChatMessage[]): { wish: string; outcome: string; obstacle: string } {
  let wish = '', outcome = '', obstacle = ''
  let currentPhase = 'wish'
  for (const msg of messages) {
    if (msg.role === 'assistant') {
      const phaseMatch = msg.content.match(/\[WOOP:(wish|outcome|obstacle|plan)\]/i)
      if (phaseMatch) currentPhase = phaseMatch[1].toLowerCase()
    }
    if (msg.role === 'user' && messages.indexOf(msg) > 0) {
      const clean = msg.content.replace(/\[WOOP:[^\]]*\]/gi, '').replace(/\[SUGGEST:[^\]]*\]/gi, '').trim()
      if (clean.length < 5) continue
      if (currentPhase === 'wish' && !wish) wish = clean
      else if (currentPhase === 'outcome' && !outcome) outcome = clean
      else if (currentPhase === 'obstacle' && !obstacle) obstacle = clean
    }
  }
  return { wish, outcome, obstacle }
}

function Step3EditItems({
  kpi,
  items,
  isUpdate,
  messages,
  savedWoopSummary,
  aiAdvice,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  onReorderItem,
  onSave,
  onRecoach,
  onBack,
}: {
  kpi: KPI
  items: DraftActionItem[]
  isUpdate: boolean
  messages: ChatMessage[]
  savedWoopSummary?: { wish?: string; obstacle?: string; plan?: string }
  aiAdvice: string
  onUpdateItem: (id: string, updates: Partial<DraftActionItem>) => void
  onAddItem: () => void
  onRemoveItem: (id: string) => void
  onReorderItem: (from: number, to: number) => void
  onSave: () => void
  onRecoach: () => void
  onBack: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const handleSave = async () => {
    setSaving(true)
    await onSave()
    setSaving(false)
  }

  const valid = items.length > 0 && items.every(i => i.title && i.start_date && i.end_date)

  // Use chat-extracted summary, or fallback to saved DB summary
  const chatSummary = extractWoopSummary(messages)
  const summary = {
    wish: chatSummary.wish || savedWoopSummary?.wish || '',
    obstacle: chatSummary.obstacle || savedWoopSummary?.obstacle || '',
  }
  const hasSummary = summary.wish || summary.obstacle

  return (
    <>
      {/* KPI header + recoach button */}
      <Card className="bg-blue-50 border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-blue-600 font-medium">対象KPI</p>
            <p className="text-sm font-semibold text-slate-900">{kpi.name}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={onRecoach}>
              <span className="flex items-center gap-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>
                コーチングやり直し
              </span>
            </Button>
            <Button variant="secondary" size="sm" onClick={onBack}>戻る</Button>
          </div>
        </div>
      </Card>

      {/* WOOP Summary */}
      {hasSummary && (
        <Card>
          <p className="text-sm font-semibold text-slate-700 mb-3">AIコーチング サマリー</p>
          <div className="grid grid-cols-3 gap-4">
            {summary.wish && (
              <div className="p-4 bg-blue-50 rounded-lg">
                <p className="text-xs font-semibold text-blue-600 mb-1">目標（Wish）</p>
                <p className="text-sm text-slate-800 leading-relaxed">{summary.wish}</p>
              </div>
            )}
            {summary.obstacle && (
              <div className="p-4 bg-amber-50 rounded-lg">
                <p className="text-xs font-semibold text-amber-600 mb-1">課題（Obstacle）</p>
                <p className="text-sm text-slate-800 leading-relaxed">{summary.obstacle}</p>
              </div>
            )}
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-xs font-semibold text-green-600 mb-1">解決策（Plan）</p>
              <p className="text-sm text-slate-800 leading-relaxed">以下の{items.length}つのアクションで対処</p>
            </div>
          </div>
        </Card>
      )}

      {/* Action items table */}
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '10px 8px', textAlign: 'center', fontWeight: 600, color: '#475569', width: 32 }}></th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', width: 36 }}>#</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', minWidth: 200 }}>アクション</th>
                <th style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#475569', minWidth: 120 }}>成果物</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#475569', width: 70 }}>目安期間</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#475569', width: 110 }}>開始日</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#475569', width: 70 }}>開始週</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#475569', width: 110 }}>完了日</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#475569', width: 70 }}>完了週</th>
                <th style={{ padding: '10px 12px', textAlign: 'center', fontWeight: 600, color: '#475569', width: 40 }}></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => (
                <tr
                  key={item.id}
                  draggable
                  onDragStart={() => setDragIndex(index)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => { if (dragIndex !== null && dragIndex !== index) { onReorderItem(dragIndex, index); setDragIndex(null) } }}
                  onDragEnd={() => setDragIndex(null)}
                  style={{
                    borderBottom: '1px solid #f1f5f9',
                    transition: 'background 0.15s',
                    opacity: dragIndex === index ? 0.4 : 1,
                    cursor: 'grab',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = '#f8fafc' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  {/* Drag handle */}
                  <td style={{ padding: '10px 8px', textAlign: 'center', verticalAlign: 'top', color: '#cbd5e1', cursor: 'grab' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8', fontWeight: 600, verticalAlign: 'top' }}>{index + 1}</td>
                  <td style={{ padding: '10px 12px', verticalAlign: 'top' }} onClick={() => setEditingId(editingId === item.id ? null : item.id)}>
                    {editingId === item.id ? (
                      <div className="space-y-2" onClick={e => e.stopPropagation()}>
                        <input
                          style={{ width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 6, outline: 'none' }}
                          value={item.title}
                          onChange={e => onUpdateItem(item.id, { title: e.target.value })}
                          placeholder="アクション名"
                        />
                        <textarea
                          style={{ width: '100%', padding: '6px 8px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 6, outline: 'none', resize: 'vertical' }}
                          rows={2}
                          value={item.description}
                          onChange={e => onUpdateItem(item.id, { description: e.target.value })}
                          placeholder="説明（if-thenプラン含む）"
                        />
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontWeight: 600, color: '#1e293b', margin: 0 }}>{item.title || '（未入力）'}</p>
                        {item.description && (
                          <p style={{ fontSize: 11, color: '#94a3b8', margin: '2px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const, maxWidth: 300 }}>{item.description}</p>
                        )}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '10px 12px', verticalAlign: 'top' }}>
                    {editingId === item.id ? (
                      <input
                        style={{ width: '100%', padding: '6px 8px', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 6, outline: 'none' }}
                        value={item.deliverable}
                        onChange={e => onUpdateItem(item.id, { deliverable: e.target.value })}
                        placeholder="成果物"
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <span style={{ color: '#64748b' }}>{item.deliverable || '—'}</span>
                    )}
                  </td>
                  {/* Duration weeks */}
                  <td style={{ padding: '10px 6px', textAlign: 'center', verticalAlign: 'top' }}>
                    <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{item.duration_weeks}週</span>
                  </td>
                  {/* Start date + auto week + auto-calculate end_date */}
                  <td style={{ padding: '10px 6px', textAlign: 'center', verticalAlign: 'top' }}>
                    <input
                      type="date"
                      style={{ padding: '4px 6px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, outline: 'none', width: 105 }}
                      value={item.start_date}
                      onChange={e => {
                        const newStart = e.target.value
                        const endDate = new Date(newStart)
                        endDate.setDate(endDate.getDate() + (item.duration_weeks * 7) - 1)
                        onUpdateItem(item.id, { start_date: newStart, end_date: endDate.toISOString().split('T')[0] })
                      }}
                      onClick={e => e.stopPropagation()}
                    />
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'center', verticalAlign: 'top' }}>
                    <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 500 }}>{toWeekLabel(item.start_date)}</span>
                  </td>
                  {/* End date + auto week */}
                  <td style={{ padding: '10px 6px', textAlign: 'center', verticalAlign: 'top' }}>
                    <input
                      type="date"
                      style={{ padding: '4px 6px', fontSize: 12, border: '1px solid #e2e8f0', borderRadius: 6, outline: 'none', width: 110 }}
                      value={item.end_date}
                      onChange={e => onUpdateItem(item.id, { end_date: e.target.value })}
                      onClick={e => e.stopPropagation()}
                    />
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'center', verticalAlign: 'top' }}>
                    <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 500 }}>{toWeekLabel(item.end_date)}</span>
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'center', verticalAlign: 'top' }}>
                    <button
                      onClick={e => { e.stopPropagation(); onRemoveItem(item.id) }}
                      style={{ color: '#cbd5e1', cursor: 'pointer', padding: 4, border: 'none', background: 'none', transition: 'color 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = '#ef4444' }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = '#cbd5e1' }}
                      title="削除"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {items.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            アクションアイテムがありません
          </div>
        )}
      </Card>

      {/* AI Advice */}
      {aiAdvice && (
        <Card>
          <div className="flex items-start gap-3">
            <div className="shrink-0 w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center mt-0.5">
              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-700 mb-1">AIからのアドバイス</p>
              <p className="text-sm text-slate-600 leading-relaxed">{aiAdvice}</p>
            </div>
          </div>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <Button variant="secondary" onClick={onAddItem}>
          + アクションを追加
        </Button>
        <Button onClick={handleSave} disabled={!valid} loading={saving}>
          {isUpdate ? '更新して保存' : '確定して保存'}
        </Button>
      </div>
    </>
  )
}

// ========== Step 4: ASANA-style Gantt Chart ==========

function Step4GanttChart({
  tasks,
  fiscalYear,
  members,
  onEditTask,
  onUpdateTaskDates,
  onBack,
}: {
  tasks: GanttTask[]
  fiscalYear: number
  members: ProjectMember[]
  onEditTask: (task: GanttTask) => void
  onUpdateTaskDates: (taskId: string, startDate: string, endDate: string) => void
  onBack: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const headerScrollRef = useRef<HTMLDivElement>(null)
  const bodyScrollRef = useRef<HTMLDivElement>(null)

  // Fiscal year: April of fiscalYear to March of fiscalYear+1
  const fyStart = useMemo(() => new Date(fiscalYear, 3, 1), [fiscalYear]) // April 1
  const fyEnd = useMemo(() => new Date(fiscalYear + 1, 2, 31), [fiscalYear]) // March 31 next year

  // Generate weeks (Monday to Sunday)
  const weeks = useMemo(() => {
    const result: { start: Date; end: Date; label: string }[] = []
    // Find first Monday on or after fyStart
    const d = new Date(fyStart)
    const day = d.getDay()
    const diff = day === 0 ? 1 : day === 1 ? 0 : 8 - day
    d.setDate(d.getDate() + diff)

    while (d <= fyEnd) {
      const weekStart = new Date(d)
      const weekEnd = new Date(d)
      weekEnd.setDate(weekEnd.getDate() + 6)
      result.push({
        start: weekStart,
        end: weekEnd,
        label: `${weekStart.getMonth() + 1}/${weekStart.getDate()}`,
      })
      d.setDate(d.getDate() + 7)
    }
    return result
  }, [fyStart, fyEnd])

  // Month headers
  const monthHeaders = useMemo(() => {
    const result: { label: string; spanWeeks: number }[] = []
    let currentMonth = -1
    let currentCount = 0

    for (const week of weeks) {
      const m = week.start.getMonth()
      if (m !== currentMonth) {
        if (currentMonth !== -1) {
          result.push({ label: `${currentMonth + 1}月`, spanWeeks: currentCount })
        }
        currentMonth = m
        currentCount = 1
      } else {
        currentCount++
      }
    }
    if (currentCount > 0) {
      result.push({ label: `${currentMonth + 1}月`, spanWeeks: currentCount })
    }
    return result
  }, [weeks])

  // Group tasks by KPI
  const groupedTasks = useMemo(() => {
    const map = new Map<string, GanttTask[]>()
    for (const task of tasks) {
      const group = map.get(task.kpi_name) || []
      group.push(task)
      map.set(task.kpi_name, group)
    }
    // Sort items within each group by start_date ascending
    for (const [, items] of map) {
      items.sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
    }
    return Array.from(map.entries())
  }, [tasks])

  // Today marker position
  const today = new Date()
  const todayWeekIndex = weeks.findIndex(w => today >= w.start && today <= w.end)

  const WEEK_WIDTH = 48
  const LEFT_PANEL_WIDTH = 520
  const ROW_HEIGHT = 40

  // Drag state
  const [dragging, setDragging] = useState<{ taskId: string; startX: number; origStart: string; origEnd: string } | null>(null)

  const getBarStyle = (task: GanttTask) => {
    const taskStart = new Date(task.start_date)
    const taskEnd = new Date(task.end_date)

    // Safety: invalid dates
    if (isNaN(taskStart.getTime()) || isNaN(taskEnd.getTime())) {
      return { position: 'absolute' as const, left: '0px', width: '20px', top: '8px', height: '24px', backgroundColor: '#94a3b8', borderRadius: '4px', cursor: 'pointer' }
    }

    // Find week indices - use broader matching for tasks that span beyond visible weeks
    let startIdx = weeks.findIndex(w => taskStart >= w.start && taskStart <= w.end)
    if (startIdx < 0) startIdx = weeks.findIndex(w => w.start >= taskStart)
    if (startIdx < 0) startIdx = 0

    let endIdx = weeks.findIndex(w => taskEnd >= w.start && taskEnd <= w.end)
    if (endIdx < 0) {
      // Task ends after all visible weeks - clamp to last week
      if (taskEnd > weeks[weeks.length - 1]?.end) endIdx = weeks.length - 1
      else endIdx = weeks.findIndex(w => w.end >= taskEnd)
    }
    if (endIdx < 0) endIdx = startIdx

    const safeStart = Math.max(0, Math.min(startIdx, weeks.length - 1))
    const safeEnd = Math.max(safeStart, Math.min(endIdx, weeks.length - 1))

    const left = safeStart * WEEK_WIDTH
    const width = Math.max(WEEK_WIDTH, (safeEnd - safeStart + 1) * WEEK_WIDTH - 4)

    const colors: Record<string, string> = {
      completed: '#22c55e',
      in_progress: '#3b82f6',
      delayed: '#f97316',
      not_started: '#94a3b8',
      cancelled: '#d1d5db',
    }

    return {
      position: 'absolute' as const,
      left: `${left + 2}px`,
      width: `${width}px`,
      top: '8px',
      height: '24px',
      backgroundColor: colors[task.status] || '#94a3b8',
      borderRadius: '4px',
      cursor: 'pointer',
    }
  }

  // Scroll to today on mount
  useEffect(() => {
    const scrollTo = Math.max(0, todayWeekIndex * WEEK_WIDTH - 200)
    if (bodyScrollRef.current && todayWeekIndex >= 0) {
      bodyScrollRef.current.scrollLeft = scrollTo
    }
    if (headerScrollRef.current && todayWeekIndex >= 0) {
      headerScrollRef.current.scrollLeft = scrollTo
    }
  }, [todayWeekIndex])

  if (tasks.length === 0) {
    return (
      <Card>
        <EmptyState
          title="アクションアイテムがありません"
          description="KPIに対してアクションプランを作成してください"
          action={<Button onClick={onBack}>KPI選択に戻る</Button>}
        />
      </Card>
    )
  }

  const totalRows = groupedTasks.reduce((acc, [, items]) => acc + items.length + 1, 0) // +1 for group header
  const timelineWidth = weeks.length * WEEK_WIDTH

  return (
    <>
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">ガントチャート</h3>
        <Button variant="secondary" onClick={onBack}>KPI選択に戻る</Button>
      </div>

      {/* Legend */}
      <div className="flex gap-4 text-xs text-slate-600">
        <span className="flex items-center gap-1"><span style={{ width: 12, height: 12, backgroundColor: '#22c55e', borderRadius: 2, display: 'inline-block' }} /> 完了</span>
        <span className="flex items-center gap-1"><span style={{ width: 12, height: 12, backgroundColor: '#3b82f6', borderRadius: 2, display: 'inline-block' }} /> 進行中</span>
        <span className="flex items-center gap-1"><span style={{ width: 12, height: 12, backgroundColor: '#f97316', borderRadius: 2, display: 'inline-block' }} /> 遅延</span>
        <span className="flex items-center gap-1"><span style={{ width: 12, height: 12, backgroundColor: '#94a3b8', borderRadius: 2, display: 'inline-block' }} /> 未着手</span>
      </div>

      <Card padding={false}>
        <div style={{ borderRadius: '12px', overflow: 'hidden' }}>
          {/* ===== Sticky Header Row ===== */}
          <div style={{ display: 'flex', borderBottom: '2px solid #e2e8f0', backgroundColor: '#fff', position: 'sticky', top: 0, zIndex: 20 }}>
            {/* Left header */}
            <div style={{ width: `${LEFT_PANEL_WIDTH}px`, minWidth: `${LEFT_PANEL_WIDTH}px`, borderRight: '2px solid #e2e8f0', height: '56px', display: 'flex', alignItems: 'flex-end', backgroundColor: '#fff' }}>
              <span style={{ width: 240, padding: '8px 16px' }} className="text-xs font-semibold text-slate-500">タスク</span>
              <span style={{ width: 100, padding: '8px 8px' }} className="text-xs font-semibold text-slate-500">責任者</span>
              <span style={{ width: 100, padding: '8px 8px' }} className="text-xs font-semibold text-slate-500">実行者</span>
            </div>
            {/* Right header (month + week) */}
            <div ref={headerScrollRef} style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ width: `${timelineWidth}px` }}>
                {/* Month row */}
                <div style={{ display: 'flex', height: '28px' }}>
                  {monthHeaders.map((mh, i) => (
                    <div key={i} style={{ width: `${mh.spanWeeks * WEEK_WIDTH}px`, textAlign: 'center', borderRight: '1px solid #e2e8f0', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="text-xs font-medium text-slate-600">{mh.label}</span>
                    </div>
                  ))}
                </div>
                {/* Week row */}
                <div style={{ display: 'flex', height: '28px' }}>
                  {weeks.map((w, i) => (
                    <div key={i} style={{ width: `${WEEK_WIDTH}px`, textAlign: 'center', borderRight: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span className="text-[10px] text-slate-400">{w.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ===== Body ===== */}
          <div style={{ display: 'flex' }}>
            {/* Left panel: task list */}
            <div style={{ width: `${LEFT_PANEL_WIDTH}px`, minWidth: `${LEFT_PANEL_WIDTH}px`, borderRight: '2px solid #e2e8f0', backgroundColor: '#fff', zIndex: 10 }}>
              {groupedTasks.map(([kpiName, items]) => (
                <div key={kpiName}>
                  <div style={{ height: `${ROW_HEIGHT}px`, display: 'flex', alignItems: 'center', padding: '0 16px', backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }}>
                    <span className="text-xs font-semibold text-slate-700 truncate">{kpiName}</span>
                  </div>
                  {items.map(task => (
                    <div key={task.id} style={{ height: `${ROW_HEIGHT}px`, display: 'flex', alignItems: 'center', borderBottom: '1px solid #f8fafc' }}>
                      <div style={{ width: 240, padding: '0 16px 0 28px', minWidth: 0 }}>
                        <p className="text-xs text-slate-700 truncate">{task.title}</p>
                      </div>
                      <div style={{ width: 100, padding: '0 8px' }}>
                        <span className="text-xs text-slate-500 truncate block">{task.responsible_user_name || '-'}</span>
                      </div>
                      <div style={{ width: 100, padding: '0 8px' }}>
                        <span className="text-xs text-slate-500 truncate block">{task.executor_user_name || '-'}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Right panel: timeline bars */}
            <div
              ref={bodyScrollRef}
              style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}
              onScroll={(e) => {
                // Sync header horizontal scroll with body
                if (headerScrollRef.current) {
                  headerScrollRef.current.scrollLeft = (e.target as HTMLElement).scrollLeft
                }
              }}
            >
              <div style={{ width: `${timelineWidth}px`, minWidth: '100%', position: 'relative' }}>
                {/* Today marker */}
                {todayWeekIndex >= 0 && (
                  <div style={{ position: 'absolute', left: `${todayWeekIndex * WEEK_WIDTH + WEEK_WIDTH / 2}px`, top: 0, width: '2px', backgroundColor: '#ef4444', zIndex: 5, height: `${totalRows * ROW_HEIGHT}px` }} />
                )}
                {/* Week gridlines */}
                {weeks.map((_, i) => (
                  <div key={i} style={{ position: 'absolute', left: `${i * WEEK_WIDTH}px`, top: 0, width: '1px', backgroundColor: '#f1f5f9', height: `${totalRows * ROW_HEIGHT}px` }} />
                ))}

                {groupedTasks.map(([kpiName, items]) => (
                  <div key={kpiName}>
                    <div style={{ height: `${ROW_HEIGHT}px`, backgroundColor: '#f8fafc', borderBottom: '1px solid #f1f5f9' }} />
                    {items.map(task => (
                      <div key={task.id} style={{ height: `${ROW_HEIGHT}px`, position: 'relative', borderBottom: '1px solid #f8fafc' }}>
                        <div
                          style={{ ...getBarStyle(task), cursor: 'grab' }}
                          onDoubleClick={(e) => { e.stopPropagation(); onEditTask(task) }}
                          onMouseDown={(e) => {
                            e.preventDefault()
                            const bar = e.currentTarget as HTMLElement
                            const startX = e.clientX
                            const origLeft = parseInt(bar.style.left) || 0
                            setDragging({ taskId: task.id, startX, origStart: task.start_date, origEnd: task.end_date })
                            const handleMouseMove = (ev: MouseEvent) => {
                              const dx = ev.clientX - startX
                              if (bar) bar.style.left = `${origLeft + dx}px`
                            }
                            const handleMouseUp = (ev: MouseEvent) => {
                              document.removeEventListener('mousemove', handleMouseMove)
                              document.removeEventListener('mouseup', handleMouseUp)
                              const dx = ev.clientX - startX
                              const weekShift = Math.round(dx / WEEK_WIDTH)
                              if (weekShift !== 0) {
                                const newStart = new Date(task.start_date)
                                const newEnd = new Date(task.end_date)
                                newStart.setDate(newStart.getDate() + weekShift * 7)
                                newEnd.setDate(newEnd.getDate() + weekShift * 7)
                                onUpdateTaskDates(task.id, newStart.toISOString().split('T')[0], newEnd.toISOString().split('T')[0])
                              } else {
                                if (bar) bar.style.left = `${origLeft}px`
                              }
                              setDragging(null)
                            }
                            document.addEventListener('mousemove', handleMouseMove)
                            document.addEventListener('mouseup', handleMouseUp)
                          }}
                          title={`${task.title} (${ACTION_ITEM_STATUS_LABELS[task.status]}) - ドラッグで移動 / ダブルクリックで編集`}
                        >
                          <span style={{ fontSize: '10px', color: '#fff', paddingLeft: '6px', lineHeight: '24px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block', pointerEvents: 'none' }}>
                            {task.title}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </>
  )
}

// ========== Task Edit Modal ==========

function TaskEditModal({
  task,
  onSave,
  onClose,
}: {
  task: GanttTask
  onSave: (task: GanttTask) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<GanttTask>({ ...task })
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  return (
    <Modal open title="タスクを編集" onClose={onClose} size="lg">
      <div className="space-y-4">
        <Input
          label="タイトル"
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
          required
        />
        <Textarea
          label="説明"
          value={form.description || ''}
          onChange={e => setForm({ ...form, description: e.target.value })}
          rows={2}
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="開始日"
            type="date"
            value={form.start_date}
            onChange={e => setForm({ ...form, start_date: e.target.value })}
            required
          />
          <Input
            label="完了日"
            type="date"
            value={form.end_date}
            onChange={e => setForm({ ...form, end_date: e.target.value })}
            required
          />
        </div>
        <Input
          label="成果物"
          value={form.deliverable || ''}
          onChange={e => setForm({ ...form, deliverable: e.target.value })}
          placeholder="例: 調査報告書、提案資料"
        />
        <div className="grid grid-cols-2 gap-4">
          <Input
            label="責任者"
            value={form.responsible_user_name || ''}
            onChange={e => setForm({ ...form, responsible_user_name: e.target.value })}
            placeholder="例: 佐藤 俊介"
          />
          <Input
            label="実行者"
            value={form.executor_user_name || ''}
            onChange={e => setForm({ ...form, executor_user_name: e.target.value })}
            placeholder="例: 田中 雄一"
          />
        </div>
        <Select
          label="ステータス"
          value={form.status}
          onChange={e => setForm({ ...form, status: e.target.value as ActionItemStatus })}
          options={Object.entries(ACTION_ITEM_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
        />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>キャンセル</Button>
          <Button onClick={handleSave} disabled={!form.title || !form.start_date || !form.end_date} loading={saving}>保存</Button>
        </div>
      </div>
    </Modal>
  )
}
