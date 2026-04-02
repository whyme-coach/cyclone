'use client'

import { useState, useEffect, useRef } from 'react'
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

// Module-level singleton to avoid re-creation
const supabase = createClient()

export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [organization, setOrganization] = useState<Organization | null>(null)
  const [orgRole, setOrgRole] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    const init = async () => {
      try {
        const { data: { user: currentUser } } = await supabase.auth.getUser()
        setUser(currentUser)
        if (currentUser) {
          await loadUserData(currentUser.id)
        }
      } catch {
        // ignore
      } finally {
        setLoading(false)
      }
    }

    const loadUserData = async (userId: string) => {
      const [profileRes, orgRes] = await Promise.all([
        supabase.from('user_profiles').select('*').eq('id', userId).single(),
        supabase.from('organization_members').select('*, organization:organizations(*)').eq('user_id', userId).single(),
      ])
      if (profileRes.data) setProfile(profileRes.data)
      if (orgRes.data) {
        const member = orgRes.data as OrganizationMember & { organization: Organization }
        setOrganization(member.organization)
        setOrgRole(member.role)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: string, session: { user: User } | null) => {
        const u = session?.user ?? null
        setUser(u)
        if (u) {
          await loadUserData(u.id)
        } else {
          setProfile(null)
          setOrganization(null)
          setOrgRole(null)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const signIn = async (email: string, password: string) => {
    setError(null)
    const { data, error: err } = await supabase.auth.signInWithPassword({ email, password })
    if (err) {
      const msg = err.message === 'Invalid login credentials'
        ? 'メールアドレスまたはパスワードが正しくありません'
        : err.message === 'Email not confirmed'
          ? 'メールアドレスが確認されていません。確認メールのリンクをクリックしてください。'
          : err.message
      setError(msg)
      throw err
    }
    if (!data.session) {
      setError('ログインに失敗しました。もう一度お試しください。')
      throw new Error('No session returned')
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
