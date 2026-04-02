-- Fix invitations SELECT policy to avoid auth.users subquery issues
DROP POLICY IF EXISTS "Project members can view invitations" ON invitations;
CREATE POLICY "Project members can view invitations" ON invitations
  FOR SELECT USING (is_project_member(project_id));
