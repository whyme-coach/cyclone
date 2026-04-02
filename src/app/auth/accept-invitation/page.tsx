'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { createClient } from '@/lib/supabase/client'
import { Spinner } from '@/components/ui/Spinner'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

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
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  const projectId = searchParams.get('project')

  useEffect(() => {
    if (authLoading || !user) return
    if (!projectId) {
      setStatus('error')
      setMessage('招待リンクが無効です')
      return
    }

    const acceptInvitation = async () => {
      // Find pending invitation
      const { data: invitation } = await supabase
        .from('invitations')
        .select('*')
        .eq('project_id', projectId)
        .eq('email', user.email)
        .eq('status', 'pending')
        .single()

      if (!invitation) {
        // Check if already a member
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

      // Add as project member
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

      // Update invitation status
      await supabase.from('invitations').update({ status: 'accepted' }).eq('id', invitation.id)

      setStatus('success')
      setMessage('プロジェクトに参加しました')
    }

    acceptInvitation()
  }, [user, authLoading, projectId, supabase])

  if (authLoading || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size="lg" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <Card className="max-w-md w-full text-center">
        {status === 'success' ? (
          <>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">{message}</h2>
            <Button onClick={() => router.push(`/projects/${projectId}/dashboard`)} className="mt-4">
              プロジェクトを開く
            </Button>
          </>
        ) : (
          <>
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">{message}</h2>
            <Button variant="secondary" onClick={() => router.push('/projects')} className="mt-4">
              プロジェクト一覧へ
            </Button>
          </>
        )}
      </Card>
    </div>
  )
}
