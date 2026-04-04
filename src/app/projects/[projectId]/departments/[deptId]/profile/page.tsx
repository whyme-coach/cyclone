'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams } from 'next/navigation'
import { useProjectContext } from '../../../layout'
import { Card, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Textarea'
import { Badge } from '@/components/ui/Badge'
import { Spinner } from '@/components/ui/Spinner'
import { EmptyState } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { callAI, parseAIJsonResponse } from '@/lib/ai/helpers'
import {
  EXTRACT_DEPT_PROFILE_SYSTEM_PROMPT,
  EXTRACT_DEPT_PROFILE_USER_PROMPT,
} from '@/lib/ai/prompts/extract-dept-profile'
import { createClient } from '@/lib/supabase/client'
import { safeStoragePath } from '@/lib/storage'
import type { DepartmentProfile, ProjectMember, UserProfile } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  consultant: 'コンサルタント',
  company_admin: '管理部門',
  department_manager: '部門担当',
  executive: '経営層',
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1]) // Remove data:...;base64, prefix
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

// ---------------------------------------------------------------------------
// AI extraction result type (matches prompt schema)
// ---------------------------------------------------------------------------

interface AIExtraction {
  department_overview?: string
  fiscal_year?: number
  headcount?: {
    total: number
    breakdown: Array<{ role: string; count: number; names?: string[] }>
  }
  initiatives?: Array<{
    title: string
    status: 'achieved' | 'not_achieved'
    detail: string
    kpi_results?: Array<{ name: string; target: string; actual: string }>
  }>
  kpi_results?: Array<{
    name: string
    fy_prev: string
    fy_target: string
    fy_actual: string
    achieved: boolean
    fy_next_target?: string
  }>
  strengths?: Array<{ title: string; detail: string }>
  challenges?: Array<{ title: string; detail: string }>
  technologies?: string[]
  lessons?: string
  next_year_focus?: Array<{ title: string; detail: string }>
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DepartmentProfilePage() {
  const params = useParams()
  const projectId = params.projectId as string
  const deptId = params.deptId as string

  const { project, company, departments } = useProjectContext()
  const supabase = useMemo(() => createClient(), [])
  const { toast } = useToast()

  const department = departments.find((d) => d.id === deptId)

  // ---- State ----
  const [loading, setLoading] = useState(true)
  const [members, setMembers] = useState<(ProjectMember & { user_profile?: UserProfile })[]>([])
  const [profile, setProfile] = useState<DepartmentProfile | null>(null)
  const [description, setDescription] = useState('')
  const [savingDescription, setSavingDescription] = useState(false)

  // AI extraction
  const [uploading, setUploading] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [extraction, setExtraction] = useState<AIExtraction | null>(null)
  const [savingProfile, setSavingProfile] = useState(false)

  // ---- Data fetching ----
  useEffect(() => {
    if (!projectId || !deptId) return

    const fetchData = async () => {
      setLoading(true)

      const [profileRes, membersRes] = await Promise.all([
        supabase
          .from('department_profiles')
          .select('*')
          .eq('project_id', projectId)
          .eq('department_id', deptId)
          .maybeSingle(),
        supabase
          .from('project_members')
          .select('*, user_profile:user_profiles(*)')
          .eq('project_id', projectId)
          .eq('department_id', deptId),
      ])

      if (profileRes.data) {
        setProfile(profileRes.data as DepartmentProfile)
        setDescription(profileRes.data.description || '')
      }
      if (membersRes.data) {
        setMembers(membersRes.data as (ProjectMember & { user_profile?: UserProfile })[])
      }

      setLoading(false)
    }

    fetchData()
  }, [projectId, deptId, supabase])

  // ---- Save description ----
  const handleSaveDescription = async () => {
    setSavingDescription(true)
    try {
      const res = await fetch('/api/save-dept-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          department_id: deptId,
          description,
        }),
      })
      if (!res.ok) throw new Error('保存に失敗しました')
      toast('保存しました', 'success')
    } catch (e: unknown) {
      toast('保存に失敗しました', 'error')
    } finally {
      setSavingDescription(false)
    }
  }

  // ---- PDF upload & AI extraction ----
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      // 1. Upload to storage
      setUploading(true)
      const storagePath = safeStoragePath(projectId, 'dept_review', file.name)
      const { error: uploadError } = await supabase.storage
        .from('project-files')
        .upload(storagePath, file)
      if (uploadError) throw new Error(`アップロードに失敗しました: ${uploadError.message}`)
      setUploading(false)

      // 2. AI extraction
      setExtracting(true)
      const base64 = await fileToBase64(file)
      const aiData = await callAI('extract-dept-profile', {
        system: EXTRACT_DEPT_PROFILE_SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: base64 },
              },
              {
                type: 'text',
                text: EXTRACT_DEPT_PROFILE_USER_PROMPT(department?.name || ''),
              },
            ],
          },
        ],
      })

      const parsed = parseAIJsonResponse(aiData) as AIExtraction | null
      if (!parsed) throw new Error('AIからの応答を解析できませんでした')
      setExtraction(parsed)
      toast('PDFの解析が完了しました', 'success')
    } catch (err: unknown) {
      toast('エラーが発生しました', 'error')
    } finally {
      setUploading(false)
      setExtracting(false)
      // reset input
      e.target.value = ''
    }
  }

  // ---- Save full profile (after AI extraction) ----
  const handleSaveProfile = async () => {
    if (!extraction) return
    setSavingProfile(true)
    try {
      const achievedCount =
        extraction.initiatives?.filter((i) => i.status === 'achieved').length ?? 0
      const totalCount = extraction.initiatives?.length ?? 0

      const payload: Record<string, unknown> = {
        project_id: projectId,
        department_id: deptId,
        description: extraction.department_overview || description,
        strengths: extraction.strengths,
        challenges: extraction.challenges,
        technologies: extraction.technologies,
        previous_year_summary: {
          year: extraction.fiscal_year,
          achievement_count: achievedCount,
          total_count: totalCount,
          achievement_rate: totalCount > 0 ? Math.round((achievedCount / totalCount) * 100) : 0,
          kpi_results: extraction.kpi_results || [],
          lessons: extraction.lessons || '',
        },
        previous_year_initiatives: extraction.initiatives?.map((i) => ({
          title: i.title,
          status: i.status,
          detail: i.detail,
        })),
        headcount: extraction.headcount,
        next_year_focus: extraction.next_year_focus,
        raw_extraction: extraction,
      }

      const res = await fetch('/api/save-dept-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error('保存に失敗しました')

      // Refresh profile
      const { data } = await supabase
        .from('department_profiles')
        .select('*')
        .eq('project_id', projectId)
        .eq('department_id', deptId)
        .maybeSingle()
      if (data) {
        setProfile(data as DepartmentProfile)
        setDescription(data.description || '')
      }

      toast('プロファイルを保存しました', 'success')
    } catch (err: unknown) {
      toast('保存に失敗しました', 'error')
    } finally {
      setSavingProfile(false)
    }
  }

  // ---- Derived values ----
  const achievedCount =
    extraction?.initiatives?.filter((i) => i.status === 'achieved').length ?? 0
  const totalCount = extraction?.initiatives?.length ?? 0
  const achievementRate = totalCount > 0 ? Math.round((achievedCount / totalCount) * 100) : 0

  // ---- Loading ----
  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 300 }}>
        <Spinner size="lg" />
      </div>
    )
  }

  if (!department) {
    return <EmptyState title="部門が見つかりません" description="この部門は存在しないか、アクセス権がありません。" />
  }

  // ====================================================================
  // RENDER
  // ====================================================================
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* ----------------------------------------------------------------
          Section 1: Header
      ----------------------------------------------------------------- */}
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
          部門プロファイル
        </h2>
        <p style={{ fontSize: 14, color: '#64748b' }}>{department.name}</p>
      </div>

      {/* ----------------------------------------------------------------
          Section 2: メンバー一覧
      ----------------------------------------------------------------- */}
      <Card>
        <CardTitle>メンバー一覧</CardTitle>
        {members.length === 0 ? (
          <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 12 }}>
            この部門にはメンバーが登録されていません。
          </p>
        ) : (
          <div style={{ overflowX: 'auto', marginTop: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>
                    氏名
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>
                    役職
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>
                    メール
                  </th>
                  <th style={{ textAlign: 'left', padding: '8px 12px', color: '#64748b', fontWeight: 600 }}>
                    ロール
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px 12px', color: '#0f172a' }}>
                      {m.user_profile?.full_name || '-'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#475569' }}>
                      {m.user_profile?.job_title || '-'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#475569' }}>
                      {m.user_profile?.email || '-'}
                    </td>
                    <td style={{ padding: '8px 12px' }}>
                      <Badge variant="info">{ROLE_LABELS[m.role] || m.role}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* ----------------------------------------------------------------
          Section 3: 業務分掌・部門概要
      ----------------------------------------------------------------- */}
      <Card>
        <CardTitle>業務分掌・部門概要</CardTitle>
        <div style={{ marginTop: 12 }}>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="部門の役割や業務範囲を入力してください..."
            rows={5}
          />
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={handleSaveDescription} disabled={savingDescription}>
              {savingDescription ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </Card>

      {/* ----------------------------------------------------------------
          Section 4: 過年度の取り組み（PDF取り込み）
      ----------------------------------------------------------------- */}
      <Card>
        <CardTitle>過年度の取り組み（PDF取り込み）</CardTitle>

        <div style={{ marginTop: 12 }}>
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 16px',
              border: '1px dashed #cbd5e1',
              borderRadius: 8,
              cursor: 'pointer',
              fontSize: 14,
              color: '#475569',
            }}
          >
            <svg
              style={{ width: 20, height: 20, color: '#94a3b8' }}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
              />
            </svg>
            PDFファイルを選択
            <input
              type="file"
              accept=".pdf"
              onChange={handleFileUpload}
              style={{ display: 'none' }}
              disabled={uploading || extracting}
            />
          </label>

          {(uploading || extracting) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, color: '#475569', fontSize: 14 }}>
              <Spinner size="sm" />
              {uploading ? 'アップロード中...' : 'AIで解析中...'}
            </div>
          )}
        </div>

        {/* ---- Extraction results ---- */}
        {extraction && (
          <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Summary card */}
            <div
              style={{
                display: 'flex',
                gap: 24,
                padding: 16,
                borderRadius: 8,
                background: achievementRate >= 70 ? '#f0fdf4' : achievementRate >= 40 ? '#fffbeb' : '#fef2f2',
                border: `1px solid ${achievementRate >= 70 ? '#bbf7d0' : achievementRate >= 40 ? '#fde68a' : '#fecaca'}`,
              }}
            >
              <div>
                <p style={{ fontSize: 12, color: '#64748b' }}>施策達成数</p>
                <p style={{ fontSize: 24, fontWeight: 700, color: '#0f172a' }}>
                  {achievedCount}/{totalCount}
                </p>
              </div>
              <div>
                <p style={{ fontSize: 12, color: '#64748b' }}>達成率</p>
                <p
                  style={{
                    fontSize: 24,
                    fontWeight: 700,
                    color: achievementRate >= 70 ? '#16a34a' : achievementRate >= 40 ? '#d97706' : '#dc2626',
                  }}
                >
                  {achievementRate}%
                </p>
              </div>
            </div>

            {/* Initiatives table */}
            {extraction.initiatives && extraction.initiatives.length > 0 && (
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                  施策一覧
                </h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>#</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>施策名</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>達成/未達</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>概要</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extraction.initiatives.map((ini, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 10px', color: '#64748b' }}>{idx + 1}</td>
                          <td style={{ padding: '6px 10px', color: '#0f172a', fontWeight: 500 }}>{ini.title}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <Badge variant={ini.status === 'achieved' ? 'success' : 'danger'}>
                              {ini.status === 'achieved' ? '達成' : '未達'}
                            </Badge>
                          </td>
                          <td style={{ padding: '6px 10px', color: '#475569', maxWidth: 400 }}>{ini.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* KPI results table */}
            {extraction.kpi_results && extraction.kpi_results.length > 0 && (
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                  KPI実績
                </h4>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>KPI項目</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>前年実績</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>目標</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>実績</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>達成</th>
                        <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>次年度目標</th>
                      </tr>
                    </thead>
                    <tbody>
                      {extraction.kpi_results.map((kpi, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '6px 10px', color: '#0f172a', fontWeight: 500 }}>{kpi.name}</td>
                          <td style={{ padding: '6px 10px', color: '#475569' }}>{kpi.fy_prev}</td>
                          <td style={{ padding: '6px 10px', color: '#475569' }}>{kpi.fy_target}</td>
                          <td style={{ padding: '6px 10px', color: '#475569' }}>{kpi.fy_actual}</td>
                          <td style={{ padding: '6px 10px' }}>
                            <Badge variant={kpi.achieved ? 'success' : 'danger'}>
                              {kpi.achieved ? '達成' : '未達'}
                            </Badge>
                          </td>
                          <td style={{ padding: '6px 10px', color: '#475569' }}>{kpi.fy_next_target || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Lessons */}
            {extraction.lessons && (
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                  振り返り・教訓
                </h4>
                <p style={{ fontSize: 14, color: '#475569', whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>
                  {extraction.lessons}
                </p>
              </div>
            )}

            {/* Next year focus */}
            {extraction.next_year_focus && extraction.next_year_focus.length > 0 && (
              <div>
                <h4 style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                  次年度方針
                </h4>
                <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {extraction.next_year_focus.map((item, idx) => (
                    <li key={idx} style={{ fontSize: 14, color: '#475569' }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{item.title}</span>
                      {item.detail && ` - ${item.detail}`}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Save button */}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={handleSaveProfile} disabled={savingProfile}>
                {savingProfile ? '保存中...' : 'プロファイルを保存'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ----------------------------------------------------------------
          Section 5: 部門プロファイル（保存済みデータ表示）
      ----------------------------------------------------------------- */}
      {profile && (profile.strengths || profile.challenges || profile.technologies) && (
        <Card>
          <CardTitle>部門プロファイル（保存済み）</CardTitle>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 20,
              marginTop: 16,
            }}
          >
            {/* Strengths */}
            <div style={{ borderLeft: '3px solid #22c55e', paddingLeft: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#16a34a', marginBottom: 8 }}>強み</h4>
              {profile.strengths && profile.strengths.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {profile.strengths.map((s, idx) => (
                    <li key={idx} style={{ fontSize: 13, color: '#475569' }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{s.title}</span>
                      {s.detail && (
                        <span style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                          {s.detail}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: 13, color: '#94a3b8' }}>データなし</p>
              )}
            </div>

            {/* Challenges */}
            <div style={{ borderLeft: '3px solid #f59e0b', paddingLeft: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#d97706', marginBottom: 8 }}>課題</h4>
              {profile.challenges && profile.challenges.length > 0 ? (
                <ul style={{ margin: 0, paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {profile.challenges.map((c, idx) => (
                    <li key={idx} style={{ fontSize: 13, color: '#475569' }}>
                      <span style={{ fontWeight: 600, color: '#334155' }}>{c.title}</span>
                      {c.detail && (
                        <span style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                          {c.detail}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ fontSize: 13, color: '#94a3b8' }}>データなし</p>
              )}
            </div>

            {/* Technologies */}
            <div style={{ borderLeft: '3px solid #3b82f6', paddingLeft: 16 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#2563eb', marginBottom: 8 }}>技術領域</h4>
              {profile.technologies && profile.technologies.length > 0 ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {profile.technologies.map((t, idx) => (
                    <Badge key={idx} variant="info">
                      {t}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: '#94a3b8' }}>データなし</p>
              )}
            </div>
          </div>

          {/* Headcount table */}
          {profile.headcount && profile.headcount.breakdown && profile.headcount.breakdown.length > 0 && (
            <div style={{ marginTop: 20 }}>
              <h4 style={{ fontSize: 14, fontWeight: 600, color: '#334155', marginBottom: 8 }}>
                人員構成（合計: {profile.headcount.total}名）
              </h4>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                      <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>役割</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>人数</th>
                      <th style={{ textAlign: 'left', padding: '6px 10px', color: '#64748b', fontWeight: 600 }}>氏名</th>
                    </tr>
                  </thead>
                  <tbody>
                    {profile.headcount.breakdown.map((row, idx) => (
                      <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 10px', color: '#0f172a', fontWeight: 500 }}>{row.role}</td>
                        <td style={{ padding: '6px 10px', color: '#475569' }}>{row.count}名</td>
                        <td style={{ padding: '6px 10px', color: '#475569' }}>
                          {row.names ? row.names.join('、') : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
