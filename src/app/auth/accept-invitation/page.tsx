'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/ui/Spinner'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>}>
      <AcceptInvitationContent />
    </Suspense>
  )
}

function AcceptInvitationContent() {
  const { user, loading: authLoading } = useAuth()
  const searchParams = useSearchParams()
  const router = useRouter()
  const supabase = createClient()
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'need_login'>('loading')
  const [message, setMessage] = useState('')
  const [projectName, setProjectName] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [roleName, setRoleName] = useState('')

  const projectId = searchParams.get('project')

  // Fetch project info regardless of auth state
  useEffect(() => {
    if (!projectId) return
    const fetchProject = async () => {
      // Use admin-accessible API to get project name
      try {
        const res = await fetch(`/api/project-info?projectId=${projectId}`)
        if (res.ok) {
          const data = await res.json()
          setProjectName(data.projectName || '')
          setCompanyName(data.companyName || '')
          setRoleName(data.roleName || '')
        }
      } catch {}
    }
    fetchProject()
  }, [projectId])

  useEffect(() => {
    if (authLoading) return

    if (!projectId) {
      setStatus('error')
      setMessage('招待リンクが無効です')
      return
    }

    if (!user) {
      setStatus('need_login')
      return
    }

    const acceptInvitation = async () => {
      const { data: invitation } = await supabase
        .from('invitations')
        .select('*')
        .eq('project_id', projectId)
        .eq('email', user.email)
        .eq('status', 'pending')
        .single()

      if (!invitation) {
        const { data: member } = await supabase
          .from('project_members')
          .select('id')
          .eq('project_id', projectId)
          .eq('user_id', user.id)
          .single()

        if (member) {
          setStatus('success')
          setMessage('既にプロジェクトに参加しています')
          return
        }
        setStatus('error')
        setMessage('招待が見つかりません')
        return
      }

      const { error } = await supabase.from('project_members').insert({
        project_id: projectId,
        user_id: user.id,
        role: invitation.role,
        department_id: invitation.department_id,
        invited_by: invitation.invited_by,
      })

      if (error) {
        setStatus('error')
        setMessage('参加に失敗しました')
        return
      }

      await supabase.from('invitations').update({ status: 'accepted' }).eq('id', invitation.id)
      setStatus('success')
      setMessage('プロジェクトに参加しました')
    }

    acceptInvitation()
  }, [user, authLoading, projectId, supabase])

  if (authLoading || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        {/* Project info header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Cyclone</h1>
          <p className="text-sm text-slate-500 mt-1">事業計画実行支援プラットフォーム</p>
        </div>

        {(companyName || projectName) && (
          <div className="text-center mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
            {companyName && <p className="text-lg font-semibold text-blue-900">{companyName}</p>}
            {projectName && <p className="text-sm text-blue-600 mt-0.5">{projectName}</p>}
            {roleName && <Badge variant="info" className="mt-2">{roleName}</Badge>}
          </div>
        )}

        {status === 'need_login' && (
          <Card className="text-center">
            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">プロジェクトに招待されました</h2>
            <p className="text-sm text-slate-600 mb-6">
              参加するにはログインまたは新規登録が必要です
            </p>
            <div className="space-y-3">
              <Button className="w-full" onClick={() => router.push(`/?redirect=/auth/accept-invitation?project=${projectId}`)}>
                ログイン
              </Button>
              <Button variant="secondary" className="w-full" onClick={() => router.push(`/auth/register?redirect=/auth/accept-invitation?project=${projectId}`)}>
                新規登録（初めての方）
              </Button>
            </div>
          </Card>
        )}

        {status === 'success' && (
          <Card className="text-center">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">{message}</h2>
            <p className="text-sm text-slate-600 mb-6">
              {companyName && `${companyName}のプロジェクトに参加しました。`}
            </p>
            <Button className="w-full" onClick={() => router.push(`/projects/${projectId}/dashboard`)}>
              プロジェクトを開く
            </Button>
          </Card>
        )}

        {status === 'error' && (
          <Card className="text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">{message}</h2>
            <Button variant="secondary" className="w-full" onClick={() => router.push('/projects')}>
              プロジェクト一覧へ
            </Button>
          </Card>
        )}
      </div>
    </div>
  )
}
