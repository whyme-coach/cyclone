-- Allow project members to read companies associated with their projects
CREATE POLICY "project_members_select_companies" ON companies FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM projects p
    JOIN project_members pm ON pm.project_id = p.id
    WHERE p.company_id = companies.id AND pm.user_id = auth.uid()
  )
);
