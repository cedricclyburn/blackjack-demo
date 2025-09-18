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
  maxRetries: 1,
  timeout: 60_000,
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

Task: Give friendly, confident blackjack advice as a seasoned coach. In 1-2 short sentences, explain what to do next and why (basic strategy first; consider double/split only if allowed). Keep it human and encouraging. Each reply should invoke a different reasoning.

Important: After your sentence, on a new line output exactly one JSON object with the final decision and a long reason, like:
{"action":"stand","reason":"Try to avoid busting, you've got this!"}

Valid actions: hit | stand | double | split`
}

export async function getAIRecommendation(): Promise<AIRecommendation> {
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [
    {
      role: 'system',
      content:
        'You are a seasoned blackjack coach. Be friendly, confident, and concise. Speak in one or two sentences explaining the advice, then on a new line output a single JSON object with {"action":"hit|stand|double|split","reason":"short"}. Avoid extra formatting.',
    },
    { role: 'user', content: buildPrompt() },
  ]

  const started = performance.now()
  let ttftMs: number | undefined
  let textBuffer = ''

  try {
    const stream = await llamaClient.inference.chatCompletion({
      model_id: modelId,
      messages,
      stream: true,
      sampling_params: { max_tokens: 500 } as any,
    } as any)

    for await (const chunk of stream as any) {
      const ev = chunk?.event
      if (!ev) continue
      if (ev.event_type === 'progress' && (ev.delta as any)?.type === 'text') {
        if (ttftMs === undefined) ttftMs = performance.now() - started
        const t = (ev.delta as any)?.text || ''
        if (t) textBuffer += t
      }
    }
  } catch (err) {
    const resp = await llamaClient.inference.chatCompletion({
      model_id: modelId,
      messages,
      sampling_params: { max_tokens: 500 } as any,
    } as any)
    const content = (resp as any).completion_message?.content || (resp as any).message?.content || ''
    textBuffer = typeof content === 'string' ? content : content?.[0]?.text || ''
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


