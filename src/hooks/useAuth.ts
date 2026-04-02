'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { User, AuthChangeEvent, Session } from '@supabase/supabase-js'
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
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const getUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        if (error) {
          setUser(null)
        } else {
          setUser(user)
        }
      } catch {
        setUser(null)
      } finally {
        setLoading(false)
      }
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription?.unsubscribe()
  }, [supabase])

  const fetchUserData = useCallback(async () => {
    if (!user) return

    // Fetch profile
    const { data: profileData } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('id', user.id)
      .single()
    if (profileData) setProfile(profileData)

    // Fetch organization membership
    const { data: memberships } = await supabase
      .from('organization_members')
      .select('organization_id, role')
      .eq('user_id', user.id)
      .limit(1)

    const membership = memberships?.[0]
    if (membership) {
      setOrgRole(membership.role)
      const { data: org } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', membership.organization_id)
        .single()
      if (org) setOrganization(org)
    }
  }, [user, supabase])

  useEffect(() => {
    if (user) fetchUserData()
  }, [user, fetchUserData])

  const signIn = async (email: string, password: string) => {
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      const msg = error.message === 'Invalid login credentials'
        ? 'メールアドレスまたはパスワードが正しくありません'
        : error.message
      setError(msg)
      throw error
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
    const { error } = await supabase.auth.signOut()
    if (error) console.error('Sign out error:', error)
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
