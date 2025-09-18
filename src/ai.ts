import 'llama-stack-client/shims/web'
import LlamaStackClient from 'llama-stack-client'
import { state, canDoubleDown as canDoubleDownComputed, canSplit as canSplitComputed } from '@/store'

export type Provider = 'ls'

const rawBaseURL = (import.meta as any).env?.VITE_LS_BASE_URL || ''
// If VITE_LS_BASE_URL is absolute (http...), use it; otherwise use current origin so '/v1' requests go via Vite proxy
const baseURL = /^https?:/i.test(rawBaseURL)
  ? String(rawBaseURL).replace(/\/$/, '')
  : (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173')
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
  return `You are assisting a player in Blackjack. Respond with a single word: hit, stand, double, or split. Only choose double/split if allowed.
Player hand: ${activeCards} (total ${activeTotal})
Dealer upcard: ${dealerUp}
Allowed actions: hit, stand${canDouble ? ', double' : ''}${canSplit ? ', split' : ''}
Bet: ${bet}, Bank: ${bank}
Return format: JSON {"action": "hit|stand|double|split", "reason": "short"}`
}

export async function getAIRecommendation(): Promise<AIRecommendation> {
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: 'You are a concise blackjack strategy assistant.' },
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
    })

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
    })
    const content = (resp as any).completion_message?.content || (resp as any).message?.content || ''
    textBuffer = typeof content === 'string' ? content : content?.[0]?.text || ''
  }

  const latencyMs = performance.now() - started

  let action: AIRecommendation['action'] = 'unknown'
  let rationale: string | undefined
  try {
    const parsed = JSON.parse(textBuffer || '{}')
    const a = String(parsed.action || '').toLowerCase()
    if (a === 'hit' || a === 'stand' || a === 'double' || a === 'split') action = a
    rationale = parsed.reason
  } catch {
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


