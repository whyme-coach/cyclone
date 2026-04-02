import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(req: Request) {
  // Verify cron secret
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const today = new Date().toISOString().split('T')[0]

  try {
    // Find overdue action items (past end_date, not completed/cancelled)
    const { data: overdueItems } = await supabase
      .from('action_items')
      .select('*, action_plan:action_plans(project_id, department_id)')
      .lt('end_date', today)
      .not('status', 'in', '("completed","cancelled")')

    if (!overdueItems || overdueItems.length === 0) {
      return NextResponse.json({ message: 'No overdue items', count: 0 })
    }

    // Group by project
    const byProject: Record<string, typeof overdueItems> = {}
    for (const item of overdueItems) {
      const plan = item.action_plan as { project_id: string; department_id: string } | null
      if (!plan) continue
      const pid = plan.project_id
      if (!byProject[pid]) byProject[pid] = []
      byProject[pid].push(item)
    }

    let notificationCount = 0

    for (const [projectId, items] of Object.entries(byProject)) {
      // Get project admins and consultants
      const { data: admins } = await supabase
        .from('project_members')
        .select('user_id')
        .eq('project_id', projectId)
        .in('role', ['consultant', 'company_admin'])

      if (!admins) continue

      for (const admin of admins) {
        // Create notification
        await supabase.from('notifications').insert({
          user_id: admin.user_id,
          project_id: projectId,
          type: 'report_overdue',
          title: `${items.length}件のアクションアイテムが期限超過しています`,
          body: items.slice(0, 3).map(i => i.title).join('、') + (items.length > 3 ? ' ほか' : ''),
          link: `/projects/${projectId}/dashboard`,
        })
        notificationCount++
      }
    }

    return NextResponse.json({ message: 'Overdue alerts sent', count: notificationCount })
  } catch (err) {
    console.error('Cron error:', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
