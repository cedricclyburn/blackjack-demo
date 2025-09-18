import 'llama-stack-client/shims/web'
import LlamaStackClient from 'llama-stack-client'
import { state, canDoubleDown as canDoubleDownComputed, canSplit as canSplitComputed } from '@/store'

export type Provider = 'ls'

const rawBaseURL = (import.meta as any).env?.VITE_LS_BASE_URL as string | undefined
// Resolve to an absolute base URL and strip trailing /v1 so resources can append it
let baseURL: string
if (rawBaseURL) {
  if (/^https?:/i.test(rawBaseURL)) {
    baseURL = rawBaseURL.replace(/\/$/, '').replace(/\/v1\/?$/, '')
  } else if (rawBaseURL.startsWith('/')) {
    baseURL = (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173')
  } else {
    baseURL = `http://${rawBaseURL}`.replace(/\/$/, '').replace(/\/v1\/?$/, '')
  }
} else {
  baseURL = 'http://localhost:8321'
}
const apiKey = (import.meta as any).env?.VITE_LS_API_KEY || ''
const modelId = (import.meta as any).env?.VITE_LS_MODEL_ID || 'mistral-small-24b-w8a8'

export const llamaClient = new LlamaStackClient({
  baseURL,
  apiKey,
  maxRetries: 0, // No retries for faster response
  timeout: 10_000, // Reduced timeout to 10 seconds
})

export interface AIRecommendation {
  provider: Provider
  modelId: string
  action: 'hit' | 'stand' | 'double' | 'split' | 'unknown'
  rationale?: string
  latencyMs: number
  ttftMs?: number
}

function getDealerUpCard(): string | null {
  const dealer = state.players[state.players.length - 1]
  const card = dealer?.hands?.[0]?.cards?.[0]
  return card ? `${card.rank}${card.suit}` : null
}

function getActiveHandCards(): string[] {
  const cards = state.activeHand?.cards || []
  return cards.map((c) => `${c.rank}${c.suit}`)
}

function buildPrompt(): string {
  const activeCards = getActiveHandCards().join(' ')
  const activeTotal = state.activeHand?.total ?? 0
  const dealerUp = getDealerUpCard()
  const canDouble = canDoubleDownComputed.value
  const canSplit = canSplitComputed.value
  const bank = state.activePlayer?.bank ?? 0
  const bet = state.activeHand?.bet ?? 0
  return `Context:
Player hand: ${activeCards} (total ${activeTotal})
Dealer upcard: ${dealerUp}
Allowed actions now: hit, stand${canDouble ? ', double' : ''}${canSplit ? ', split' : ''}
Bet: ${bet}, Bank: ${bank}

Task: Recommend the best blackjack action and output ONLY a JSON object:
{"action":"hit|stand|double|split","reason":"Brief explanation"}

Choose based on basic strategy. Be encouraging!`
}

export async function getAIRecommendation(): Promise<AIRecommendation> {
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [
    {
      role: 'system',
      content:
        'You are a blackjack expert. Respond with ONLY a JSON object: {"action":"hit|stand|double|split","reason":"brief explanation"}. No other text.',
    },
    { role: 'user', content: buildPrompt() },
  ]

  const started = performance.now()
  let ttftMs: number | undefined
  let textBuffer = ''

  // Use non-streaming for faster, more reliable responses
  try {
    const resp = await llamaClient.inference.chatCompletion({
      model_id: modelId,
      messages,
      stream: false,
      sampling_params: { 
        max_tokens: 200,  // Reduced for faster response
        temperature: 0.7,
        top_p: 0.9
      } as any,
    } as any)
    
    const content = (resp as any).completion_message?.content || (resp as any).message?.content || ''
    textBuffer = typeof content === 'string' ? content : content?.[0]?.text || ''
    ttftMs = performance.now() - started
  } catch (err) {
    console.error('AI API error:', err)
    // Fallback to a simple response if API fails
    textBuffer = '{"action":"hit","reason":"Unable to connect to AI. Basic strategy suggests hitting on 16 vs dealer 10."}'
  }

  const latencyMs = performance.now() - started

  let action: AIRecommendation['action'] = 'unknown'
  let rationale: string | undefined
  // Try to extract a JSON decision from the free-form text
  const parseDecision = (text: string) => {
    const cleaned = (text || '')
      .replace(/```json/g, '```')
      .replace(/```/g, '')
      .trim()
    const jsonMatches = cleaned.match(/\{[\s\S]*?\}/g)
    if (!jsonMatches || jsonMatches.length === 0) return null
    // Prefer the last JSON-looking block
    for (let i = jsonMatches.length - 1; i >= 0; i--) {
      try {
        const obj = JSON.parse(jsonMatches[i]) as { action?: string; reason?: string }
        const a = String(obj.action || '').toLowerCase()
        if (a === 'hit' || a === 'stand' || a === 'double' || a === 'split') {
          return { action: a as AIRecommendation['action'], reason: obj.reason }
        }
      } catch {
        // continue trying previous matches
      }
    }
    return null
  }

  const decision = parseDecision(textBuffer)
  if (decision) {
    action = decision.action
    rationale = decision.reason
  } else {
    const m = (textBuffer || '').toLowerCase()
    if (m.includes('double') && canDoubleDownComputed.value) action = 'double'
    else if (m.includes('split') && canSplitComputed.value) action = 'split'
    else if (m.includes('stand')) action = 'stand'
    else if (m.includes('hit')) action = 'hit'
  }

  return { provider: 'ls', modelId, action, rationale, latencyMs, ttftMs }
}

export async function notifyBalanceViaAgent(note: string): Promise<void> {
  const agentId = (import.meta as any).env?.VITE_LS_NTFY_AGENT_ID || 'blackjack-ai-balance-notifications'
  try {
    await llamaClient.post(`/agents/${agentId}/invoke`, {
      body: { message: note },
    })
  } catch {
    // best-effort, ignore
  }
}


