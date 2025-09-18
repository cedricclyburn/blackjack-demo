import 'llama-stack-client/shims/web'
import LlamaStackClient from 'llama-stack-client'
import { state, canDoubleDown as canDoubleDownComputed, canSplit as canSplitComputed } from '@/store'

type Provider = 'ollama' | 'vllm'

const baseURL = (import.meta as any).env?.VITE_LS_BASE_URL || 'http://localhost:8080/v1'
const apiKey = (import.meta as any).env?.VITE_LS_API_KEY || ''
const ollamaModel = (import.meta as any).env?.VITE_LS_OLLAMA_MODEL_ID || 'llama3.2'
const vllmModel = (import.meta as any).env?.VITE_LS_VLLM_MODEL_ID || 'mistral-small-24b-w8a8'

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

function chooseModel(provider: Provider): string {
  return provider === 'ollama' ? ollamaModel : vllmModel
}

export async function getAIRecommendation(provider: Provider): Promise<AIRecommendation> {
  const modelId = chooseModel(provider)
  const messages = [
    { role: 'system', content: 'You are a concise blackjack strategy assistant.' },
    { role: 'user', content: buildPrompt() },
  ] as const

  const started = performance.now()
  const response = await llamaClient.inference.chatCompletion({
    model_id: modelId,
    messages,
  })
  const latencyMs = performance.now() - started

  const content = (response as any).completion_message?.content || (response as any).message?.content || ''
  let action: AIRecommendation['action'] = 'unknown'
  let rationale: string | undefined
  try {
    const parsed = JSON.parse(typeof content === 'string' ? content : content?.[0]?.text || '{}')
    const a = String(parsed.action || '').toLowerCase()
    if (a === 'hit' || a === 'stand' || a === 'double' || a === 'split') action = a
    rationale = parsed.reason
  } catch {
    const text: string = typeof content === 'string' ? content : content?.[0]?.text || ''
    const m = text.toLowerCase()
    if (m.includes('double') && canDoubleDownComputed.value) action = 'double'
    else if (m.includes('split') && canSplitComputed.value) action = 'split'
    else if (m.includes('stand')) action = 'stand'
    else if (m.includes('hit')) action = 'hit'
  }

  return { provider, modelId, action, rationale, latencyMs }
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


