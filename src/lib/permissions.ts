import type { ProjectRole } from '@/types'

type Action =
  | 'project:edit_settings'
  | 'project:close_year'
  | 'project:invite_members'
  | 'members:manage'
  | 'goals:edit'
  | 'strategies:edit'
  | 'measures:edit'
  | 'kpis:edit'
  | 'action_plans:edit'
  | 'action_items:edit'
  | 'progress:report'
  | 'monthly_report:create'
  | 'monthly_report:finalize'
  | 'review:manage'
  | 'feedback:comment'
  | 'dashboard:view_all_departments'

const ROLE_PERMISSIONS: Record<ProjectRole, Action[]> = {
  consultant: [
    'project:edit_settings',
    'project:close_year',
    'project:invite_members',
    'members:manage',
    'goals:edit',
    'strategies:edit',
    'measures:edit',
    'kpis:edit',
    'action_plans:edit',
    'action_items:edit',
    'progress:report',
    'monthly_report:create',
    'monthly_report:finalize',
    'review:manage',
    'feedback:comment',
    'dashboard:view_all_departments',
  ],
  company_admin: [
    'project:edit_settings',
    'project:close_year',
    'project:invite_members',
    'members:manage',
    'goals:edit',
    'strategies:edit',
    'measures:edit',
    'kpis:edit',
    'action_plans:edit',
    'action_items:edit',
    'progress:report',
    'monthly_report:create',
    'monthly_report:finalize',
    'review:manage',
    'feedback:comment',
    'dashboard:view_all_departments',
  ],
  department_manager: [
    'measures:edit',
    'kpis:edit',
    'action_plans:edit',
    'action_items:edit',
    'progress:report',
    'monthly_report:create',
  ],
  executive: [
    'feedback:comment',
    'dashboard:view_all_departments',
  ],
}

export function hasPermission(role: ProjectRole, action: Action): boolean {
  return ROLE_PERMISSIONS[role]?.includes(action) ?? false
}

export function canEditDepartment(
  role: ProjectRole,
  userDepartmentId: string | undefined,
  targetDepartmentId: string
): boolean {
  if (role === 'consultant' || role === 'company_admin') return true
  if (role === 'department_manager') return userDepartmentId === targetDepartmentId
  return false
}
