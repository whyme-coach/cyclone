import type {
  ProjectRole,
  ProjectStatus,
  ActionItemStatus,
  ProgressStatus,
  ReportingFrequency,
  ReviewCycle,
  NotificationType,
  AICoachContextType,
  OrganizationRole,
} from './roles'

// ============================================================
// Core Entities
// ============================================================

export interface Organization {
  id: string
  name: string
  address?: string
  phone?: string
  website?: string
  logo_url?: string
  created_at: string
  updated_at: string
}

export interface Company {
  id: string
  organization_id: string
  name: string
  name_kana?: string
  website?: string
  address?: string
  established_date?: string
  capital?: number
  fiscal_year_end?: number
  industry?: string
  business_description?: string
  employee_count?: string
  representative?: string
  phone?: string
  scraped_data?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Project {
  id: string
  organization_id: string
  company_id: string
  name: string
  fiscal_year: number
  fiscal_year_start?: string
  fiscal_year_end?: string
  status: ProjectStatus
  current_setup_step: number
  reporting_frequency: ReportingFrequency
  review_cycle: ReviewCycle
  is_closed: boolean
  closed_at?: string
  closed_by?: string
  created_by: string
  created_at: string
  updated_at: string
  // joined
  company?: Company
}

// ============================================================
// User & Access Control
// ============================================================

export interface UserProfile {
  id: string
  full_name?: string
  email: string
  avatar_url?: string
  job_title?: string
  phone?: string
  created_at: string
  updated_at: string
}

export interface DepartmentProfile {
  id: string
  project_id: string
  department_id: string
  description?: string
  strengths?: Array<{ title: string; detail: string }>
  challenges?: Array<{ title: string; detail: string }>
  technologies?: string[]
  previous_year_summary?: {
    year: number
    achievement_count: number
    total_count: number
    achievement_rate: number
    kpi_results: Array<{ name: string; fy_prev: string; fy_target: string; fy_actual: string; achieved: boolean }>
    lessons: string
  }
  previous_year_initiatives?: Array<{ title: string; status: 'achieved' | 'not_achieved'; detail: string }>
  headcount?: { total: number; breakdown: Array<{ role: string; count: number; names?: string[] }> }
  next_year_focus?: Array<{ title: string; detail: string }>
  raw_extraction?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: OrganizationRole
  joined_at: string
  // joined
  user_profile?: UserProfile
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: ProjectRole
  department_id?: string
  invited_by?: string
  joined_at: string
  // joined
  user_profile?: UserProfile
  department?: Department
}

export interface Invitation {
  id: string
  project_id: string
  email: string
  role: ProjectRole
  department_id?: string
  invited_by: string
  status: 'pending' | 'accepted' | 'expired'
  created_at: string
  updated_at: string
}

// ============================================================
// Business Plan Structure
// ============================================================

export interface Department {
  id: string
  project_id: string
  name: string
  parent_id?: string
  level: number
  sort_order: number
  manager_user_id?: string
  role_description?: string
  responsibilities?: string[]
  created_at: string
  updated_at: string
  // joined
  children?: Department[]
}

export interface ManagementGoal {
  id: string
  project_id: string
  type: 'qualitative' | 'quantitative'
  title: string
  description?: string
  target_value?: string
  target_unit?: string
  sort_order: number
  created_at: string
  updated_at: string
}

export interface Strategy {
  id: string
  project_id: string
  title: string
  description?: string
  sort_order: number
  created_at: string
  updated_at: string
  // joined
  measures?: Measure[]
}

export interface Measure {
  id: string
  project_id: string
  department_id?: string
  title: string
  description?: string
  created_by?: string
  sort_order: number
  created_at: string
  updated_at: string
  // joined
  department?: Department
  strategies?: Strategy[]
}

export interface StrategyMeasureLink {
  id: string
  strategy_id: string
  measure_id: string
  linked_by: 'ai' | 'manual'
}

// ============================================================
// Operations
// ============================================================

export interface KPI {
  id: string
  project_id: string
  measure_id?: string
  department_id?: string
  name: string
  description?: string
  target_value?: number
  target_unit?: string
  current_value?: number
  previous_year_max?: number
  frequency: 'weekly' | 'monthly' | 'quarterly'
  created_by?: string
  created_at: string
  updated_at: string
}

export interface KPIRecord {
  id: string
  kpi_id: string
  record_date: string
  value: number
  recorded_by?: string
  created_at: string
}

export interface ActionPlan {
  id: string
  project_id: string
  measure_id?: string
  kpi_id?: string
  department_id?: string
  title: string
  fiscal_year: number
  fiscal_quarter?: number
  status: 'draft' | 'active' | 'completed' | 'revised'
  woop_summary?: { wish?: string; obstacle?: string; plan?: string }
  created_by?: string
  created_at: string
  updated_at: string
  // joined
  action_items?: ActionItem[]
}

export interface ActionItem {
  id: string
  action_plan_id: string
  title: string
  description?: string
  responsible_user_id?: string
  executor_user_id?: string
  start_date: string
  end_date: string
  deliverable?: string
  status: ActionItemStatus
  progress_percent: number
  sort_order: number
  created_at: string
  updated_at: string
  // joined
  responsible_user?: UserProfile
  executor_user?: UserProfile
}

// ============================================================
// Reporting
// ============================================================

export interface ProgressReport {
  id: string
  action_item_id: string
  project_id: string
  reporter_user_id: string
  report_period_start?: string
  report_period_end?: string
  status: ProgressStatus
  activities_completed?: string
  reflections?: string
  next_actions?: string
  kpi_value?: number
  submitted_at?: string
  is_draft: boolean
  created_at: string
  updated_at: string
  // joined
  reporter?: UserProfile
  action_item?: ActionItem
}

export interface ReportComment {
  id: string
  progress_report_id?: string
  monthly_report_id?: string
  user_id: string
  content: string
  created_at: string
  updated_at: string
  // joined
  user?: UserProfile
}

export interface MonthlyReport {
  id: string
  project_id: string
  department_id?: string
  report_month: string
  content?: Record<string, unknown>
  ai_analysis?: Record<string, unknown>
  status: 'draft' | 'finalized' | 'reviewed'
  finalized_at?: string
  finalized_by?: string
  created_at: string
  updated_at: string
}

// ============================================================
// System
// ============================================================

export interface ReviewCycleRecord {
  id: string
  project_id: string
  cycle_type: 'quarterly' | 'semi_annual' | 'year_end'
  period_start: string
  period_end: string
  status: 'pending' | 'in_progress' | 'completed'
  ai_summary?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Notification {
  id: string
  user_id: string
  project_id?: string
  type: NotificationType
  title: string
  body?: string
  link?: string
  is_read: boolean
  created_at: string
}

export interface AIConversationLog {
  id: string
  project_id?: string
  user_id: string
  context_type: AICoachContextType
  context_id?: string
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    timestamp: string
  }>
  created_at: string
  updated_at: string
}

export interface UploadedFile {
  id: string
  project_id: string
  uploaded_by?: string
  file_name: string
  file_size?: number
  file_type?: string
  category: 'business_plan' | 'org_chart' | 'report' | 'deliverable' | 'other'
  storage_path: string
  extraction_status: 'pending' | 'processing' | 'completed' | 'failed'
  extraction_result?: Record<string, unknown>
  created_at: string
}

// ============================================================
// Business Plan Data (structured extraction)
// ============================================================

export interface BusinessPlanData {
  id: string
  project_id: string
  fiscal_year: number
  mission?: string
  vision?: string
  value_statement?: string
  business_policies?: Array<{ title: string; description: string }>
  financial_plan?: {
    unit?: string
    previous_year_label?: string
    plan_year_label?: string
    pl?: Array<{ item: string; previous?: number; plan?: number }>
    bs?: Array<{ item: string; previous?: number; plan?: number }>
  }
  investment_plan?: Array<{ item?: string; category: string; amount?: number; unit?: string; description: string; schedule?: string }>
  personnel_plan?: Array<{ department: string; current_count?: number; planned_count?: number; hiring_plan?: string }>
  schedule?: Array<{ milestone: string; target_date?: string; description?: string }>
  raw_extraction?: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface BusinessPlanExtraction {
  fiscal_year?: number
  mission?: string
  vision?: string
  value_statement?: string
  business_policies?: Array<{ title: string; description: string }>
  management_goals?: Array<{
    type: 'qualitative' | 'quantitative'
    title: string
    description?: string
    target_value?: string
    target_unit?: string
  }>
  strategies?: Array<{
    title: string
    description?: string
    strategy_type?: 'business' | 'functional' | 'other'
    measures?: Array<{
      title: string
      description?: string
      target_department?: string
    }>
  }>
  financial_plan?: {
    unit?: string
    previous_year_label?: string
    plan_year_label?: string
    pl?: Array<{ item: string; previous?: number; plan?: number }>
    bs?: Array<{ item: string; previous?: number; plan?: number }>
  }
  investment_plan?: Array<{ item?: string; category: string; amount?: number; unit?: string; description: string; schedule?: string }>
  personnel_plan?: Array<{ department: string; current_count?: number; planned_count?: number; hiring_plan?: string }>
  schedule?: Array<{ milestone: string; target_date?: string; description?: string }>
}

// Re-export role types
export type {
  ProjectRole,
  ProjectStatus,
  ActionItemStatus,
  ProgressStatus,
  ReportingFrequency,
  ReviewCycle,
  NotificationType,
  AICoachContextType,
  OrganizationRole,
}
