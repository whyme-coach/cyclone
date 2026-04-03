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
      const items: DraftActionItem[] = existing.action_items.map(ai => ({
        id: ai.id,
        title: ai.title,
        description: ai.description || '',
        deliverable: ai.deliverable || '',
        start_date: ai.start_date,
        end_date: ai.end_date,
      }))
      setDraftItems(items)
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
        const userPrompt = COACH_ACTION_PLAN_USER_PROMPT(
          selectedKpi.name,
          selectedKpi.description || '',
          String(selectedKpi.target_value || ''),
          selectedKpi.target_unit || '',
          String(selectedKpi.previous_year_max || ''),
          department?.name || '',
          fiscalYear,
        )
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
    const parsed = parseAIJsonResponse(aiData) as { ready?: boolean; action_items?: Array<{ title: string; description?: string; deliverable?: string; start_date?: string; end_date?: string }> } | null
    if (parsed?.ready && parsed.action_items) {
      const fiscalYear = project?.fiscal_year || new Date().getFullYear()
      const items: DraftActionItem[] = parsed.action_items.map((item, i) => ({
        id: `draft-${i}`,
        title: item.title,
        description: item.description || '',
        deliverable: item.deliverable || '',
        start_date: item.start_date || `${fiscalYear}-04-07`,
        end_date: item.end_date || `${fiscalYear}-05-02`,
      }))
      setDraftItems(items)
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
    const fiscalYear = project?.fiscal_year || new Date().getFullYear()
    setDraftItems(prev => [
      ...prev,
      {
        id: `draft-${Date.now()}`,
        title: '',
        description: '',
        deliverable: '',
        start_date: `${fiscalYear}-04-07`,
        end_date: `${fiscalYear}-05-02`,
      },
    ])
  }

  const handleRemoveDraftItem = (id: string) => {
    setDraftItems(prev => prev.filter(item => item.id !== id))
  }

  const handleSaveActionPlan = async () => {
    if (!project || !selectedKpi || draftItems.length === 0) return
    try {
      if (existingPlanForKpi) {
        // Update existing: delete old items, insert new
        await supabase
          .from('action_items')
          .delete()
          .eq('action_plan_id', existingPlanForKpi.id)
        for (let i = 0; i < draftItems.length; i++) {
          const item = draftItems[i]
          await supabase.from('action_items').insert({
            action_plan_id: existingPlanForKpi.id,
            title: item.title,
            description: item.description,
            deliverable: item.deliverable,
            start_date: item.start_date,
            end_date: item.end_date,
            sort_order: i,
            status: 'not_started',
            progress_percent: 0,
          })
        }
        toast('アクションプランを更新しました', 'success')
      } else {
        // Create new plan
        const { data: planData } = await supabase
          .from('action_plans')
          .insert({
            project_id: project.id,
            department_id: deptId,
            kpi_id: selectedKpi.id,
            title: selectedKpi.name,
            fiscal_year: project.fiscal_year,
            status: 'active',
            created_by: member?.user_id || null,
          })
          .select()
          .single()

        if (!planData) {
          toast('プランの作成に失敗しました', 'error')
          return
        }

        for (let i = 0; i < draftItems.length; i++) {
          const item = draftItems[i]
          await supabase.from('action_items').insert({
            action_plan_id: planData.id,
            title: item.title,
            description: item.description,
            deliverable: item.deliverable,
            start_date: item.start_date,
            end_date: item.end_date,
            sort_order: i,
            status: 'not_started',
            progress_percent: 0,
          })
        }
        toast('アクションプランを保存しました', 'success')
      }

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
    const [planRes, memberRes] = await Promise.all([
      supabase
        .from('action_plans')
        .select('*, action_items(*, responsible_user:user_profiles!action_items_responsible_user_id_fkey(*), executor_user:user_profiles!action_items_executor_user_id_fkey(*))')
        .eq('department_id', deptId)
        .eq('project_id', project.id),
      supabase
        .from('project_members')
        .select('*, user:user_profiles(*)')
        .eq('project_id', projectId),
    ])

    if (memberRes.data) setProjectMembers(memberRes.data as ProjectMember[])

    if (planRes.data) {
      const tasks: GanttTask[] = []
      for (const plan of planRes.data as (ActionPlan & { action_items: (ActionItem & { responsible_user?: { full_name?: string } })[] })[]) {
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
            responsible_user_name: item.responsible_user?.full_name || undefined,
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
      await supabase
        .from('action_items')
        .update({
          title: task.title,
          description: task.description,
          start_date: task.start_date,
          end_date: task.end_date,
          status: task.status,
          deliverable: task.deliverable,
          responsible_user_id: task.responsible_user_id || null,
          executor_user_id: task.executor_user_id || null,
        })
        .eq('id', task.id)
      setGanttTasks(prev => prev.map(t => t.id === task.id ? task : t))
      toast('更新しました', 'success')
      setShowEditModal(false)
      setEditingTask(null)
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
          onUpdateItem={handleUpdateDraftItem}
          onAddItem={handleAddDraftItem}
          onRemoveItem={handleRemoveDraftItem}
          onSave={handleSaveActionPlan}
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
              onBack={() => setStep(1)}
            />
          )}
          {showEditModal && editingTask && (
            <TaskEditModal
              task={editingTask}
              members={projectMembers}
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

function Step3EditItems({
  kpi,
  items,
  isUpdate,
  onUpdateItem,
  onAddItem,
  onRemoveItem,
  onSave,
  onBack,
}: {
  kpi: KPI
  items: DraftActionItem[]
  isUpdate: boolean
  onUpdateItem: (id: string, updates: Partial<DraftActionItem>) => void
  onAddItem: () => void
  onRemoveItem: (id: string) => void
  onSave: () => void
  onBack: () => void
}) {
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    await onSave()
    setSaving(false)
  }

  const valid = items.length > 0 && items.every(i => i.title && i.start_date && i.end_date)

  return (
    <>
      <Card className="bg-blue-50 border-blue-200">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-blue-600 font-medium">対象KPI</p>
            <p className="text-sm font-semibold text-slate-900">{kpi.name}</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onBack}>戻る</Button>
        </div>
      </Card>

      <div className="space-y-4">
        {items.map((item, index) => (
          <Card key={item.id}>
            <div className="flex items-start justify-between mb-3">
              <span className="text-xs font-medium text-slate-500">アクション {index + 1}</span>
              <button
                onClick={() => onRemoveItem(item.id)}
                className="text-slate-400 hover:text-red-500 p-1"
                title="削除"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
            <div className="space-y-3">
              <Input
                label="タイトル"
                value={item.title}
                onChange={e => onUpdateItem(item.id, { title: e.target.value })}
                required
              />
              <Textarea
                label="説明"
                value={item.description}
                onChange={e => onUpdateItem(item.id, { description: e.target.value })}
                rows={2}
              />
              <Input
                label="成果物"
                value={item.deliverable}
                onChange={e => onUpdateItem(item.id, { deliverable: e.target.value })}
                placeholder="例: 調査報告書、提案資料"
              />
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="開始日"
                  type="date"
                  value={item.start_date}
                  onChange={e => onUpdateItem(item.id, { start_date: e.target.value })}
                  required
                />
                <Input
                  label="完了日"
                  type="date"
                  value={item.end_date}
                  onChange={e => onUpdateItem(item.id, { end_date: e.target.value })}
                  required
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

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
  onBack,
}: {
  tasks: GanttTask[]
  fiscalYear: number
  members: ProjectMember[]
  onEditTask: (task: GanttTask) => void
  onBack: () => void
}) {
  const scrollRef = useRef<HTMLDivElement>(null)

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
    return Array.from(map.entries())
  }, [tasks])

  // Today marker position
  const today = new Date()
  const todayWeekIndex = weeks.findIndex(w => today >= w.start && today <= w.end)

  const WEEK_WIDTH = 48
  const LEFT_PANEL_WIDTH = 320
  const ROW_HEIGHT = 40

  const getBarStyle = (task: GanttTask) => {
    const taskStart = new Date(task.start_date)
    const taskEnd = new Date(task.end_date)
    const startIdx = weeks.findIndex(w => taskStart <= w.end && taskStart >= w.start)
    const endIdx = weeks.findIndex(w => taskEnd <= w.end && taskEnd >= w.start)
    const effectiveStart = startIdx >= 0 ? startIdx : weeks.findIndex(w => w.start >= taskStart)
    const effectiveEnd = endIdx >= 0 ? endIdx : weeks.length - 1

    const left = Math.max(0, effectiveStart) * WEEK_WIDTH
    const width = Math.max(1, (Math.min(effectiveEnd, weeks.length - 1) - Math.max(0, effectiveStart) + 1)) * WEEK_WIDTH - 4

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
    if (scrollRef.current && todayWeekIndex >= 0) {
      scrollRef.current.scrollLeft = Math.max(0, todayWeekIndex * WEEK_WIDTH - 200)
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
        <div style={{ display: 'flex', overflow: 'hidden', borderRadius: '12px' }}>
          {/* Left panel: sticky task list */}
          <div style={{
            width: `${LEFT_PANEL_WIDTH}px`,
            minWidth: `${LEFT_PANEL_WIDTH}px`,
            borderRight: '2px solid #e2e8f0',
            backgroundColor: '#fff',
            zIndex: 10,
          }}>
            {/* Left header */}
            <div style={{ height: '56px', borderBottom: '1px solid #e2e8f0', padding: '8px 16px', display: 'flex', alignItems: 'flex-end' }}>
              <span className="text-xs font-semibold text-slate-500">タスク</span>
            </div>
            {/* Left rows */}
            {groupedTasks.map(([kpiName, items]) => (
              <div key={kpiName}>
                {/* Group header */}
                <div style={{
                  height: `${ROW_HEIGHT}px`,
                  display: 'flex',
                  alignItems: 'center',
                  padding: '0 16px',
                  backgroundColor: '#f8fafc',
                  borderBottom: '1px solid #f1f5f9',
                }}>
                  <span className="text-xs font-semibold text-slate-700 truncate">{kpiName}</span>
                </div>
                {/* Task rows */}
                {items.map(task => (
                  <div key={task.id} style={{
                    height: `${ROW_HEIGHT}px`,
                    display: 'flex',
                    alignItems: 'center',
                    padding: '0 16px 0 28px',
                    borderBottom: '1px solid #f8fafc',
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p className="text-xs text-slate-700 truncate">{task.title}</p>
                    </div>
                    {task.responsible_user_name && (
                      <span className="text-[10px] text-slate-400 ml-2 whitespace-nowrap">{task.responsible_user_name}</span>
                    )}
                  </div>
                ))}
              </div>
            ))}
          </div>

          {/* Right panel: scrollable timeline */}
          <div ref={scrollRef} style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}>
            <div style={{ width: `${timelineWidth}px`, minWidth: '100%' }}>
              {/* Month + Week header */}
              <div style={{ height: '56px', borderBottom: '1px solid #e2e8f0' }}>
                {/* Month row */}
                <div style={{ display: 'flex', height: '28px' }}>
                  {monthHeaders.map((mh, i) => (
                    <div key={i} style={{
                      width: `${mh.spanWeeks * WEEK_WIDTH}px`,
                      textAlign: 'center',
                      borderRight: '1px solid #e2e8f0',
                      borderBottom: '1px solid #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <span className="text-xs font-medium text-slate-600">{mh.label}</span>
                    </div>
                  ))}
                </div>
                {/* Week row */}
                <div style={{ display: 'flex', height: '28px' }}>
                  {weeks.map((w, i) => (
                    <div key={i} style={{
                      width: `${WEEK_WIDTH}px`,
                      textAlign: 'center',
                      borderRight: '1px solid #f1f5f9',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <span className="text-[10px] text-slate-400">{w.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Timeline rows */}
              <div style={{ position: 'relative' }}>
                {/* Today marker */}
                {todayWeekIndex >= 0 && (
                  <div style={{
                    position: 'absolute',
                    left: `${todayWeekIndex * WEEK_WIDTH + WEEK_WIDTH / 2}px`,
                    top: 0,
                    bottom: 0,
                    width: '2px',
                    backgroundColor: '#ef4444',
                    zIndex: 5,
                    height: `${totalRows * ROW_HEIGHT}px`,
                  }} />
                )}

                {/* Week gridlines */}
                {weeks.map((_, i) => (
                  <div key={i} style={{
                    position: 'absolute',
                    left: `${i * WEEK_WIDTH}px`,
                    top: 0,
                    width: '1px',
                    backgroundColor: '#f1f5f9',
                    height: `${totalRows * ROW_HEIGHT}px`,
                  }} />
                ))}

                {groupedTasks.map(([kpiName, items]) => (
                  <div key={kpiName}>
                    {/* Group header row (empty in timeline) */}
                    <div style={{
                      height: `${ROW_HEIGHT}px`,
                      backgroundColor: '#f8fafc',
                      borderBottom: '1px solid #f1f5f9',
                    }} />
                    {/* Task bars */}
                    {items.map(task => (
                      <div key={task.id} style={{
                        height: `${ROW_HEIGHT}px`,
                        position: 'relative',
                        borderBottom: '1px solid #f8fafc',
                      }}>
                        <div
                          style={getBarStyle(task)}
                          onClick={() => onEditTask(task)}
                          title={`${task.title} (${ACTION_ITEM_STATUS_LABELS[task.status]})`}
                        >
                          <span style={{
                            fontSize: '10px',
                            color: '#fff',
                            paddingLeft: '6px',
                            lineHeight: '24px',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            display: 'block',
                          }}>
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
  members,
  onSave,
  onClose,
}: {
  task: GanttTask
  members: ProjectMember[]
  onSave: (task: GanttTask) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<GanttTask>({ ...task })
  const [saving, setSaving] = useState(false)

  const memberOptions = useMemo(() => {
    return [
      { value: '', label: '未割当' },
      ...members
        .filter(m => m.user_profile)
        .map(m => ({
          value: m.user_id,
          label: m.user_profile?.full_name || m.user_profile?.email || m.user_id,
        })),
    ]
  }, [members])

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
          <Select
            label="責任者"
            value={form.responsible_user_id || ''}
            onChange={e => setForm({ ...form, responsible_user_id: e.target.value || undefined })}
            options={memberOptions}
          />
          <Select
            label="実行者"
            value={form.executor_user_id || ''}
            onChange={e => setForm({ ...form, executor_user_id: e.target.value || undefined })}
            options={memberOptions}
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
