'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User } from '@supabase/supabase-js'
import type { UserProfile, Organization, OrganizationMember } from '@/types'

interface UseAuthReturn {
  user: User | null
  profile: UserProfile | null
  loading: boolean
  error: string | null
  organization: Organization | null
  orgRole: string | null
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, fullName: string) => Promise<void>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<void>
  updateProfile: (updates: Partial<UserProfile>) => Promise<void>
}

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [orgRole, setOrgRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const supabase = createClient()

  const fetchProfile = useCallback(async (userId: string) => {
    const { data } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', userId)
      .single()
    if (data) setProfile(data)
  }, [supabase])

  const fetchOrganization = useCallback(async (userId: string) => {
    const { data: member } = await supabase
      .from('organization_members')
      .select('*, organization:organizations(*)')
      .eq('user_id', userId)
      .single()

    if (member) {
      setOrganization((member as OrganizationMember & { organization: Organization }).organization)
      setOrgRole(member.role)
    } else {
      // Auto-create organization for new users (consultant flow)
      try {
        const res = await fetch('/api/setup-org', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        })
        if (res.ok) {
          const data = await res.json()
          if (data.organization) {
            setOrganization(data.organization)
            setOrgRole('owner')
          }
        }
      } catch {
        // ignore - org setup will be retried
      }
    }
  }, [supabase])

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        setUser(currentUser)
        if (currentUser) {
          await Promise.all([
            fetchProfile(currentUser.id),
            fetchOrganization(currentUser.id),
          ])
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }
    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: string, session: { user: User } | null) => {
        const u = session?.user ?? null
        setUser(u)
        if (u) {
          await Promise.all([
            fetchProfile(u.id),
            fetchOrganization(u.id),
          ])
        } else {
          setProfile(null)
          setOrganization(null)
          setOrgRole(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase, fetchProfile, fetchOrganization])

  const signIn = async (email: string, password: string) => {
    setError(null)
    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'メールアドレスまたはパスワードが正しくありません'
        : err.message)
      throw err
    }
  }

  const signUp = async (email: string, password: string, fullName: string) => {
    setError(null)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    const { error: err } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${siteUrl}/auth/callback`,
      },
    })
    if (err) {
      setError(err.message)
      throw err
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setOrganization(null)
    setOrgRole(null)
  }

  const resetPassword = async (email: string) => {
    setError(null)
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${siteUrl}/auth/callback?next=/settings`,
    })
    if (err) {
      setError(err.message)
      throw err
    }
  }

  const updateProfile = async (updates: Partial<UserProfile>) => {
    if (!user) return
    const { error: err } = await supabase
      .from('user_profiles')
      .update(updates)
      .eq('id', user.id)
    if (err) throw err
    setProfile(prev => prev ? { ...prev, ...updates } : null)
  }

  return {
    user, profile, loading, error,
    organization, orgRole,
    signIn, signUp, signOut, resetPassword, updateProfile,
  }
}
