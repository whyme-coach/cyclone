import { handleAIRoute } from '../_shared'

export const maxDuration = 300

export async function POST(req: Request) {
  return handleAIRoute(req, {
    routeName: 'scrape-company',
    defaultModel: 'claude-sonnet-4-6',
    defaultMaxTokens: 4096,
    allowedToolTypes: ['web_search_20250305'],
    longRunning: true,
  })
}
