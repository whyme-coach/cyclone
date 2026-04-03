import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

interface ClaudeRequestOptions {
  routeName: string
  defaultModel: string
  defaultMaxTokens: number
  allowedToolTypes?: string[]
  longRunning?: boolean
}

const ALLOWED_MODELS = ['claude-sonnet-4-6', 'claude-haiku-4-5', 'claude-opus-4-6']
const MAX_SYSTEM_LENGTH = 4000
const rateLimitMap = new Map<string, { count: number; windowStart: number }>()
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 20

function checkRateLimit(userId: string): boolean {
  const now = Date.now()
  const entry = rateLimitMap.get(userId)
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    rateLimitMap.set(userId, { count: 1, windowStart: now })
    return true
  }
  entry.count++
  return entry.count <= RATE_LIMIT_MAX_REQUESTS
}

setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS * 2) {
      rateLimitMap.delete(key)
    }
  }
}, RATE_LIMIT_WINDOW_MS * 5)

function sanitizeTools(
  tools: unknown,
  allowedToolTypes: string[]
): Record<string, unknown>[] | undefined {
  if (!Array.isArray(tools) || allowedToolTypes.length === 0) return undefined
  const filtered = tools.filter(
    (t: unknown) => typeof t === 'object' && t !== null && allowedToolTypes.includes((t as Record<string, unknown>).type as string)
  )
  return filtered.length > 0 ? filtered : undefined
}

function sanitizeSystem(system: unknown): string | { type: string; text: string }[] | undefined {
  if (!system) return undefined
  if (typeof system === 'string') return system.slice(0, MAX_SYSTEM_LENGTH)
  if (Array.isArray(system)) {
    const blocks = system
      .filter((b: unknown) => typeof b === 'object' && b !== null && (b as Record<string, unknown>).type === 'text' && typeof (b as Record<string, unknown>).text === 'string')
      .map((b: unknown) => ({ type: 'text' as const, text: ((b as Record<string, unknown>).text as string).slice(0, MAX_SYSTEM_LENGTH) }))
    return blocks.length > 0 ? blocks : undefined
  }
  return undefined
}

export async function handleAIRoute(req: Request, options: ClaudeRequestOptions) {
  const { routeName, defaultModel, defaultMaxTokens, allowedToolTypes = [] } = options

  let userId: string
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = user.id
  } catch {
    return NextResponse.json({ error: 'Authentication failed' }, { status: 401 })
  }

  if (!checkRateLimit(userId)) {
    return NextResponse.json(
      { error: 'リクエスト頻度が高すぎます。しばらく待ってからお試しください。' },
      { status: 429 }
    )
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 })
  }

  if (!body.messages || !Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json({ error: 'messages field is required' }, { status: 400 })
  }
  if (body.messages.length > 50) {
    return NextResponse.json({ error: 'メッセージ数が上限(50)を超えています' }, { status: 400 })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 })
  }

  const requestedModel = (body.model as string) || ''
  const model = ALLOWED_MODELS.includes(requestedModel) ? requestedModel : defaultModel
  const maxTokens = Math.min(
    typeof body.maxTokens === 'number' && body.maxTokens > 0 ? body.maxTokens : defaultMaxTokens,
    defaultMaxTokens
  )
  const sanitizedTools = sanitizeTools(body.tools, allowedToolTypes)
  const sanitizedSystem = sanitizeSystem(body.system)

  const hasWebSearch = sanitizedTools?.some((t) => (t as Record<string, unknown>).type === 'web_search_20250305') ?? false
  const timeoutMs = (hasWebSearch || options.longRunning) ? 300000 : 120000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  const hasPdfDocument = Array.isArray(body.messages) && body.messages.some((msg: unknown) => {
    const m = msg as Record<string, unknown>
    return Array.isArray(m.content) && (m.content as Record<string, unknown>[]).some((block) =>
      block.type === 'document' && (block.source as Record<string, unknown>)?.media_type === 'application/pdf'
    )
  })

  let response: Response
  try {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    }
    const betaFeatures: string[] = []
    if (hasWebSearch) betaFeatures.push('web-search-2025-03-05')
    if (hasPdfDocument) betaFeatures.push('pdfs-2024-09-25')
    if (betaFeatures.length > 0) {
      headers['anthropic-beta'] = betaFeatures.join(',')
    }

    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        temperature: 0,
        top_p: 0.1,
        messages: body.messages,
        ...(sanitizedTools ? { tools: sanitizedTools } : {}),
        ...(sanitizedSystem ? { system: sanitizedSystem } : {}),
      }),
      signal: controller.signal,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof Error && err.name === 'AbortError') {
      return NextResponse.json({ error: 'Request timeout' }, { status: 504 })
    }
    console.error(`Network error (${routeName}):`, err)
    return NextResponse.json({ error: 'Failed to reach Claude API' }, { status: 503 })
  }
  clearTimeout(timeoutId)

  if (!response.ok) {
    const errText = await response.text().catch(() => 'Unknown error')
    console.error(`Claude API error (${routeName}):`, errText)
    const clientStatus = response.status === 429 ? 429 : response.status >= 500 ? 502 : 500
    return NextResponse.json(
      { error: 'AI処理でエラーが発生しました。しばらく経ってから再度お試しください。' },
      { status: clientStatus }
    )
  }

  let data
  try {
    data = await response.json()
  } catch {
    return NextResponse.json({ error: 'Invalid response from Claude API' }, { status: 502 })
  }

  return NextResponse.json(data)
}
