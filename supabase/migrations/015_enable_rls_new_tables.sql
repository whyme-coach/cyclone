-- Enable RLS on all tables added after initial migration

-- department_profiles
ALTER TABLE department_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_members_select_dept_profiles" ON department_profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = department_profiles.project_id AND project_members.user_id = auth.uid())
);
CREATE POLICY "project_members_all_dept_profiles" ON department_profiles FOR ALL USING (
  EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = department_profiles.project_id AND project_members.user_id = auth.uid())
);

-- timeline_posts
ALTER TABLE timeline_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_members_select_timeline_posts" ON timeline_posts FOR SELECT USING (
  EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = timeline_posts.project_id AND project_members.user_id = auth.uid())
);
CREATE POLICY "project_members_insert_timeline_posts" ON timeline_posts FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = timeline_posts.project_id AND project_members.user_id = auth.uid())
);

-- timeline_comments
ALTER TABLE timeline_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_select_timeline_comments" ON timeline_comments FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_insert_timeline_comments" ON timeline_comments FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- kpi_measure_links
ALTER TABLE kpi_measure_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated_select_kpi_measure_links" ON kpi_measure_links FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated_all_kpi_measure_links" ON kpi_measure_links FOR ALL USING (auth.uid() IS NOT NULL);

-- business_plan_data
ALTER TABLE business_plan_data ENABLE ROW LEVEL SECURITY;
CREATE POLICY "project_members_select_bpd" ON business_plan_data FOR SELECT USING (
  EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = business_plan_data.project_id AND project_members.user_id = auth.uid())
);
CREATE POLICY "project_members_all_bpd" ON business_plan_data FOR ALL USING (
  EXISTS (SELECT 1 FROM project_members WHERE project_members.project_id = business_plan_data.project_id AND project_members.user_id = auth.uid())
);
