export type OrganizationRole = 'owner' | 'consultant'

export type ProjectRole = 'consultant' | 'company_admin' | 'department_manager' | 'executive'

export type ProjectStatus = 'setup' | 'planning' | 'active' | 'review' | 'closed'

export type ActionItemStatus = 'not_started' | 'in_progress' | 'completed' | 'delayed' | 'cancelled'

export type ProgressStatus = 'on_track' | 'at_risk' | 'delayed' | 'completed' | 'blocked'

export type ReportingFrequency = 'weekly' | 'monthly'

export type ReviewCycle = 'quarterly' | 'semi_annual'

export type NotificationType =
  | 'report_due'
  | 'report_overdue'
  | 'report_submitted'
  | 'feedback_received'
  | 'review_started'
  | 'plan_revised'
  | 'invitation'
  | 'year_closed'
  | 'ai_alert'

export type AICoachContextType =
  | 'report_coaching'
  | 'quarterly_review'
  | 'year_end_review'
  | 'kpi_suggestion'
  | 'action_plan_suggestion'
  | 'gap_analysis'
  | 'meeting_materials'

export const PROJECT_ROLE_LABELS: Record<ProjectRole, string> = {
  consultant: '経営コンサルタント',
  company_admin: '管理部門',
  department_manager: '部門責任者',
  executive: '経営層',
}

export const PROJECT_STATUS_LABELS: Record<ProjectStatus, string> = {
  setup: '初期設定',
  planning: '計画策定',
  active: '運用中',
  review: 'レビュー',
  closed: 'クローズ',
}

export const ACTION_ITEM_STATUS_LABELS: Record<ActionItemStatus, string> = {
  not_started: '未着手',
  in_progress: '進行中',
  completed: '完了',
  delayed: '遅延',
  cancelled: '中止',
}

export const PROGRESS_STATUS_LABELS: Record<ProgressStatus, string> = {
  on_track: '順調',
  at_risk: 'リスクあり',
  delayed: '遅延',
  completed: '完了',
  blocked: 'ブロック中',
}
