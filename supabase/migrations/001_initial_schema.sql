-- ============================================================
-- Cyclone Database Schema
-- ============================================================

-- ============================================================
-- Core Entities
-- ============================================================

CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  website TEXT,
  logo_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_kana TEXT,
  website TEXT,
  address TEXT,
  established_date TEXT,
  capital BIGINT,
  fiscal_year_end INT CHECK (fiscal_year_end BETWEEN 1 AND 12),
  industry TEXT,
  business_description TEXT,
  employee_count TEXT,
  representative TEXT,
  phone TEXT,
  scraped_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  fiscal_year_start DATE,
  fiscal_year_end DATE,
  status TEXT NOT NULL DEFAULT 'setup' CHECK (status IN ('setup', 'planning', 'active', 'review', 'closed')),
  current_setup_step INT NOT NULL DEFAULT 1,
  reporting_frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (reporting_frequency IN ('weekly', 'monthly')),
  review_cycle TEXT NOT NULL DEFAULT 'quarterly' CHECK (review_cycle IN ('quarterly', 'semi_annual')),
  is_closed BOOLEAN NOT NULL DEFAULT false,
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES auth.users(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- User & Access Control
-- ============================================================

CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT NOT NULL,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'consultant' CHECK (role IN ('owner', 'consultant')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

CREATE TABLE project_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('consultant', 'company_admin', 'department_manager', 'executive')),
  department_id UUID,
  invited_by UUID REFERENCES auth.users(id),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, user_id)
);

CREATE TABLE invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('company_admin', 'department_manager', 'executive')),
  department_id UUID,
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, email)
);

-- ============================================================
-- Business Plan Structure
-- ============================================================

CREATE TABLE departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  level INT NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  manager_user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK for project_members.department_id after departments table exists
ALTER TABLE project_members ADD CONSTRAINT fk_project_members_department
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;

ALTER TABLE invitations ADD CONSTRAINT fk_invitations_department
  FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE SET NULL;

CREATE TABLE management_goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('qualitative', 'quantitative')),
  title TEXT NOT NULL,
  description TEXT,
  target_value TEXT,
  target_unit TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE measures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE strategy_measure_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES strategies(id) ON DELETE CASCADE,
  measure_id UUID NOT NULL REFERENCES measures(id) ON DELETE CASCADE,
  linked_by TEXT NOT NULL DEFAULT 'manual' CHECK (linked_by IN ('ai', 'manual')),
  UNIQUE(strategy_id, measure_id)
);

-- ============================================================
-- Operations
-- ============================================================

CREATE TABLE kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  measure_id UUID REFERENCES measures(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  target_value NUMERIC,
  target_unit TEXT,
  current_value NUMERIC,
  frequency TEXT NOT NULL DEFAULT 'monthly' CHECK (frequency IN ('weekly', 'monthly', 'quarterly')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE kpi_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id UUID NOT NULL REFERENCES kpis(id) ON DELETE CASCADE,
  record_date DATE NOT NULL,
  value NUMERIC NOT NULL,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(kpi_id, record_date)
);

CREATE TABLE action_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  measure_id UUID REFERENCES measures(id) ON DELETE SET NULL,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  fiscal_year INT NOT NULL,
  fiscal_quarter INT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'revised')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE action_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_plan_id UUID NOT NULL REFERENCES action_plans(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  responsible_user_id UUID REFERENCES auth.users(id),
  executor_user_id UUID REFERENCES auth.users(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  deliverable TEXT,
  status TEXT NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'delayed', 'cancelled')),
  progress_percent INT NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Reporting
-- ============================================================

CREATE TABLE progress_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action_item_id UUID NOT NULL REFERENCES action_items(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  reporter_user_id UUID NOT NULL REFERENCES auth.users(id),
  report_period_start DATE,
  report_period_end DATE,
  status TEXT NOT NULL DEFAULT 'on_track' CHECK (status IN ('on_track', 'at_risk', 'delayed', 'completed', 'blocked')),
  activities_completed TEXT,
  reflections TEXT,
  next_actions TEXT,
  kpi_value NUMERIC,
  submitted_at TIMESTAMPTZ,
  is_draft BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE report_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  progress_report_id UUID REFERENCES progress_reports(id) ON DELETE CASCADE,
  monthly_report_id UUID,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
  report_month DATE NOT NULL,
  content JSONB,
  ai_analysis JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'finalized', 'reviewed')),
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add FK for report_comments.monthly_report_id
ALTER TABLE report_comments ADD CONSTRAINT fk_report_comments_monthly_report
  FOREIGN KEY (monthly_report_id) REFERENCES monthly_reports(id) ON DELETE CASCADE;

-- ============================================================
-- System
-- ============================================================

CREATE TABLE review_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  cycle_type TEXT NOT NULL CHECK (cycle_type IN ('quarterly', 'semi_annual', 'year_end')),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed')),
  ai_summary JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN (
    'report_due', 'report_overdue', 'report_submitted',
    'feedback_received', 'review_started', 'plan_revised',
    'invitation', 'year_closed', 'ai_alert'
  )),
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ai_conversation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  context_type TEXT NOT NULL CHECK (context_type IN (
    'report_coaching', 'quarterly_review', 'year_end_review',
    'kpi_suggestion', 'action_plan_suggestion', 'gap_analysis', 'meeting_materials'
  )),
  context_id UUID,
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES auth.users(id),
  file_name TEXT NOT NULL,
  file_size BIGINT,
  file_type TEXT,
  category TEXT NOT NULL CHECK (category IN ('business_plan', 'org_chart', 'report', 'deliverable', 'other')),
  storage_path TEXT NOT NULL,
  extraction_status TEXT NOT NULL DEFAULT 'pending' CHECK (extraction_status IN ('pending', 'processing', 'completed', 'failed')),
  extraction_result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX idx_companies_org ON companies(organization_id);
CREATE INDEX idx_projects_org ON projects(organization_id);
CREATE INDEX idx_projects_company ON projects(company_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_project_members_project ON project_members(project_id);
CREATE INDEX idx_project_members_user ON project_members(user_id);
CREATE INDEX idx_org_members_org ON organization_members(organization_id);
CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_departments_project ON departments(project_id);
CREATE INDEX idx_management_goals_project ON management_goals(project_id);
CREATE INDEX idx_strategies_project ON strategies(project_id);
CREATE INDEX idx_measures_project ON measures(project_id);
CREATE INDEX idx_measures_department ON measures(department_id);
CREATE INDEX idx_kpis_project ON kpis(project_id);
CREATE INDEX idx_kpis_department ON kpis(department_id);
CREATE INDEX idx_kpi_records_kpi ON kpi_records(kpi_id);
CREATE INDEX idx_action_plans_project ON action_plans(project_id);
CREATE INDEX idx_action_plans_department ON action_plans(department_id);
CREATE INDEX idx_action_items_plan ON action_items(action_plan_id);
CREATE INDEX idx_progress_reports_item ON progress_reports(action_item_id);
CREATE INDEX idx_progress_reports_project ON progress_reports(project_id);
CREATE INDEX idx_monthly_reports_project ON monthly_reports(project_id);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE NOT is_read;
CREATE INDEX idx_ai_logs_user ON ai_conversation_logs(user_id);
CREATE INDEX idx_uploaded_files_project ON uploaded_files(project_id);
CREATE INDEX idx_invitations_project ON invitations(project_id);
CREATE INDEX idx_invitations_email ON invitations(email);

-- ============================================================
-- Updated_at trigger function
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to all tables with updated_at column
CREATE TRIGGER trg_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_user_profiles_updated_at BEFORE UPDATE ON user_profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_invitations_updated_at BEFORE UPDATE ON invitations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_management_goals_updated_at BEFORE UPDATE ON management_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_strategies_updated_at BEFORE UPDATE ON strategies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_measures_updated_at BEFORE UPDATE ON measures FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_kpis_updated_at BEFORE UPDATE ON kpis FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_action_plans_updated_at BEFORE UPDATE ON action_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_action_items_updated_at BEFORE UPDATE ON action_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_progress_reports_updated_at BEFORE UPDATE ON progress_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_report_comments_updated_at BEFORE UPDATE ON report_comments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_monthly_reports_updated_at BEFORE UPDATE ON monthly_reports FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_review_cycles_updated_at BEFORE UPDATE ON review_cycles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_ai_logs_updated_at BEFORE UPDATE ON ai_conversation_logs FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- Auto-create user_profile on sign up
-- ============================================================

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', '')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
