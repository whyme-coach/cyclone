'use client'

import { useState, useEffect } from 'react'
import { useProjectContext } from '../layout'
import { Card, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { createClient } from '@/lib/supabase/client'
import type { ProjectMember, UserProfile } from '@/types'
import { PROJECT_ROLE_LABELS } from '@/types/roles'

export default function MembersPage() {
  const { project } = useProjectContext()
  const [members, setMembers] = useState<(ProjectMember & { user_profile: UserProfile })[]>([])
  const supabase = createClient()

  useEffect(() => {
    if (!project) return
    const fetch = async () => {
      const { data } = await supabase
        .from('project_members')
        .select('*, user_profile:user_profiles(*)')
        .eq('project_id', project.id)
      if (data) setMembers(data as (ProjectMember & { user_profile: UserProfile })[])
    }
    fetch()
  }, [project, supabase])

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-bold text-slate-900">メンバー管理</h2>
      <Card>
        <CardTitle>プロジェクトメンバー</CardTitle>
        <div className="mt-4 divide-y divide-slate-100">
          {members.map(m => (
            <div key={m.id} className="py-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-900">{m.user_profile?.full_name || m.user_profile?.email}</p>
                <p className="text-xs text-slate-500">{m.user_profile?.email}</p>
              </div>
              <Badge variant="info">
                {PROJECT_ROLE_LABELS[m.role]}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
