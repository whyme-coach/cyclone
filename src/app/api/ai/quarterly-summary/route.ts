import { handleAIRoute } from '../_shared'

export const maxDuration = 120

export async function POST(req: Request) {
  return handleAIRoute(req, {
    routeName: 'quarterly-summary',
    defaultModel: 'claude-sonnet-4-6',
    defaultMaxTokens: 8192,
  })
}
