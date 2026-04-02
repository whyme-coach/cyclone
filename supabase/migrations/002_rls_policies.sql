-- ============================================================
-- RLS Helper Functions
-- ============================================================

CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_org_member(p_org_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = p_org_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION get_project_role(p_project_id UUID)
RETURNS TEXT AS $$
  SELECT role FROM project_members
  WHERE project_id = p_project_id AND user_id = auth.uid()
  LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================================
-- Enable RLS on all tables
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE management_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategies ENABLE ROW LEVEL SECURITY;
ALTER TABLE measures ENABLE ROW LEVEL SECURITY;
ALTER TABLE strategy_measure_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE kpi_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE action_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_conversation_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploaded_files ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- user_profiles
-- ============================================================

CREATE POLICY "Users can view all profiles" ON user_profiles
  FOR SELECT USING (true);

CREATE POLICY "Users can update own profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid());

-- ============================================================
-- organizations
-- ============================================================

CREATE POLICY "Org members can view" ON organizations
  FOR SELECT USING (is_org_member(id));

CREATE POLICY "Org owners can update" ON organizations
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM organization_members WHERE organization_id = id AND user_id = auth.uid() AND role = 'owner')
  );

CREATE POLICY "Authenticated users can create orgs" ON organizations
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- ============================================================
-- organization_members
-- ============================================================

CREATE POLICY "Org members can view members" ON organization_members
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "Org owners can manage members" ON organization_members
  FOR ALL USING (
    EXISTS (SELECT 1 FROM organization_members om WHERE om.organization_id = organization_members.organization_id AND om.user_id = auth.uid() AND om.role = 'owner')
  );

-- ============================================================
-- companies
-- ============================================================

CREATE POLICY "Org members can view companies" ON companies
  FOR SELECT USING (is_org_member(organization_id));

CREATE POLICY "Org members can manage companies" ON companies
  FOR ALL USING (is_org_member(organization_id));

-- ============================================================
-- projects
-- ============================================================

CREATE POLICY "Project members can view" ON projects
  FOR SELECT USING (is_project_member(id) OR is_org_member(organization_id));

CREATE POLICY "Org members can create projects" ON projects
  FOR INSERT WITH CHECK (is_org_member(organization_id));

CREATE POLICY "Consultants and admins can update" ON projects
  FOR UPDATE USING (get_project_role(id) IN ('consultant', 'company_admin'));

-- ============================================================
-- project_members
-- ============================================================

CREATE POLICY "Project members can view members" ON project_members
  FOR SELECT USING (is_project_member(project_id));

CREATE POLICY "Consultants and admins can manage members" ON project_members
  FOR ALL USING (get_project_role(project_id) IN ('consultant', 'company_admin'));

-- ============================================================
-- invitations
-- ============================================================

CREATE POLICY "Project members can view invitations" ON invitations
  FOR SELECT USING (is_project_member(project_id) OR email = (SELECT email FROM auth.users WHERE id = auth.uid()));

CREATE POLICY "Consultants and admins can manage invitations" ON invitations
  FOR ALL USING (get_project_role(project_id) IN ('consultant', 'company_admin'));

-- ============================================================
-- Project-scoped tables (departments, goals, strategies, measures, etc.)
-- All follow the same pattern: project members can read, specific roles can write
-- ============================================================

-- departments
CREATE POLICY "Project members can view" ON departments
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Consultants and admins can manage" ON departments
  FOR ALL USING (get_project_role(project_id) IN ('consultant', 'company_admin'));

-- management_goals
CREATE POLICY "Project members can view" ON management_goals
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Consultants and admins can manage" ON management_goals
  FOR ALL USING (get_project_role(project_id) IN ('consultant', 'company_admin'));

-- strategies
CREATE POLICY "Project members can view" ON strategies
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Consultants and admins can manage" ON strategies
  FOR ALL USING (get_project_role(project_id) IN ('consultant', 'company_admin'));

-- measures
CREATE POLICY "Project members can view" ON measures
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Members with edit rights can manage" ON measures
  FOR ALL USING (get_project_role(project_id) IN ('consultant', 'company_admin', 'department_manager'));

-- strategy_measure_links
CREATE POLICY "Project members can view" ON strategy_measure_links
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM strategies s WHERE s.id = strategy_id AND is_project_member(s.project_id))
  );
CREATE POLICY "Consultants and admins can manage" ON strategy_measure_links
  FOR ALL USING (
    EXISTS (SELECT 1 FROM strategies s WHERE s.id = strategy_id AND get_project_role(s.project_id) IN ('consultant', 'company_admin', 'department_manager'))
  );

-- kpis
CREATE POLICY "Project members can view" ON kpis
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Members with edit rights can manage" ON kpis
  FOR ALL USING (get_project_role(project_id) IN ('consultant', 'company_admin', 'department_manager'));

-- kpi_records
CREATE POLICY "Project members can view" ON kpi_records
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM kpis k WHERE k.id = kpi_id AND is_project_member(k.project_id))
  );
CREATE POLICY "Members with edit rights can manage" ON kpi_records
  FOR ALL USING (
    EXISTS (SELECT 1 FROM kpis k WHERE k.id = kpi_id AND get_project_role(k.project_id) IN ('consultant', 'company_admin', 'department_manager'))
  );

-- action_plans
CREATE POLICY "Project members can view" ON action_plans
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Members with edit rights can manage" ON action_plans
  FOR ALL USING (get_project_role(project_id) IN ('consultant', 'company_admin', 'department_manager'));

-- action_items
CREATE POLICY "Project members can view" ON action_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM action_plans ap WHERE ap.id = action_plan_id AND is_project_member(ap.project_id))
  );
CREATE POLICY "Members with edit rights can manage" ON action_items
  FOR ALL USING (
    EXISTS (SELECT 1 FROM action_plans ap WHERE ap.id = action_plan_id AND get_project_role(ap.project_id) IN ('consultant', 'company_admin', 'department_manager'))
  );

-- progress_reports
CREATE POLICY "Project members can view" ON progress_reports
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Members can create/update reports" ON progress_reports
  FOR ALL USING (get_project_role(project_id) IN ('consultant', 'company_admin', 'department_manager'));

-- report_comments
CREATE POLICY "Project members can view" ON report_comments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM progress_reports pr WHERE pr.id = progress_report_id AND is_project_member(pr.project_id)
    ) OR EXISTS (
      SELECT 1 FROM monthly_reports mr WHERE mr.id = monthly_report_id AND is_project_member(mr.project_id)
    )
  );
CREATE POLICY "Authenticated users can create comments" ON report_comments
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- monthly_reports
CREATE POLICY "Project members can view" ON monthly_reports
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Members with edit rights can manage" ON monthly_reports
  FOR ALL USING (get_project_role(project_id) IN ('consultant', 'company_admin', 'department_manager'));

-- review_cycles
CREATE POLICY "Project members can view" ON review_cycles
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Consultants and admins can manage" ON review_cycles
  FOR ALL USING (get_project_role(project_id) IN ('consultant', 'company_admin'));

-- notifications
CREATE POLICY "Users can view own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- ai_conversation_logs
CREATE POLICY "Users can view own logs" ON ai_conversation_logs
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users can manage own logs" ON ai_conversation_logs
  FOR ALL USING (user_id = auth.uid());

-- uploaded_files
CREATE POLICY "Project members can view" ON uploaded_files
  FOR SELECT USING (is_project_member(project_id));
CREATE POLICY "Members with upload rights can manage" ON uploaded_files
  FOR ALL USING (get_project_role(project_id) IN ('consultant', 'company_admin', 'department_manager'));

-- ============================================================
-- Storage bucket
-- ============================================================

INSERT INTO storage.buckets (id, name, public) VALUES ('project-files', 'project-files', false);

CREATE POLICY "Project members can upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'project-files'
    AND auth.uid() IS NOT NULL
  );

CREATE POLICY "Project members can read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'project-files'
    AND auth.uid() IS NOT NULL
  );
