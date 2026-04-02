import { handleAIRoute } from '../_shared'

export const maxDuration = 300

export async function POST(req: Request) {
  return handleAIRoute(req, {
    routeName: 'extract-responsibilities',
    defaultModel: 'claude-sonnet-4-6',
    defaultMaxTokens: 8192,
    longRunning: true,
  })
}
