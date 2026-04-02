export async function callAI(
  endpoint: string,
  body: {
    messages: Array<{ role: string; content: unknown }>
    system?: string
    model?: string
    maxTokens?: number
    tools?: unknown[]
  }
): Promise<unknown> {
  const response = await fetch(`/api/ai/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: 'Unknown error' }))
    throw new Error(err.error || `AI request failed: ${response.status}`)
  }

  return response.json()
}

export function parseAIJsonResponse(data: unknown): unknown {
  if (!data || typeof data !== 'object') return null

  const response = data as Record<string, unknown>
  const content = response.content
  if (!Array.isArray(content)) return null

  for (const block of content) {
    if (typeof block !== 'object' || block === null) continue
    const b = block as Record<string, unknown>
    if (b.type === 'text' && typeof b.text === 'string') {
      const text = b.text.trim()
      // Try to extract JSON from markdown code blocks
      const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
      const jsonStr = jsonMatch ? jsonMatch[1].trim() : text
      try {
        return JSON.parse(jsonStr)
      } catch {
        // Try to find JSON object or array within the text
        const objMatch = jsonStr.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
        if (objMatch) {
          try {
            return JSON.parse(objMatch[1])
          } catch {
            return null
          }
        }
      }
    }
  }
  return null
}

export function getAITextResponse(data: unknown): string {
  if (!data || typeof data !== 'object') return ''

  const response = data as Record<string, unknown>
  const content = response.content
  if (!Array.isArray(content)) return ''

  return content
    .filter((block: unknown) => {
      const b = block as Record<string, unknown>
      return b.type === 'text' && typeof b.text === 'string'
    })
    .map((block: unknown) => (block as Record<string, unknown>).text as string)
    .join('\n')
}
