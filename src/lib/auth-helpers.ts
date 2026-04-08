import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Verify that the given user is a member of the specified project.
 * Uses admin client to bypass RLS.
 * Returns the member record if found, null otherwise.
 */
export async function verifyProjectMember(userId: string, projectId: string) {
  const admin = createAdminClient()
  const { data } = await admin
    .from('project_members')
    .select('id, role, department_id')
    .eq('project_id', projectId)
    .eq('user_id', userId)
    .single()
  return data
}
