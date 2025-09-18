import { reactive, computed } from 'vue'

export type Provider = 'ls' | 'ollama' | 'vllm'

export interface Metric {
  timestamp: number
  provider: Provider
  modelId?: string
  latencyMs: number
  ttftMs?: number
}

const state = reactive({
  samples: [] as Metric[],
})

export function recordMetric(sample: Metric) {
  state.samples.push(sample)
  if (state.samples.length > 200) state.samples.shift()
}

export const metricsState = state

export const byProvider = computed(() => {
  const result: Record<Provider, Metric[]> = { ls: [], ollama: [], vllm: [] } as any
  for (const s of state.samples) result[s.provider].push(s)
  return result
})

export const byModel = computed(() => {
  const map = new Map<string, Metric[]>()
  for (const s of state.samples) {
    const key = s.modelId || 'unknown'
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(s)
  }
  return map
})

export const summary = computed(() => {
  function agg(list: Metric[]) {
    const n = list.length || 1
    const lat = list.reduce((a, b) => a + b.latencyMs, 0) / n
    const ttftValues = list.map((x) => x.ttftMs).filter((x): x is number => typeof x === 'number')
    const ttft = ttftValues.length ? ttftValues.reduce((a, b) => a + b, 0) / ttftValues.length : undefined
    return { count: list.length, avgLatencyMs: Math.round(lat), avgTtftMs: ttft ? Math.round(ttft) : undefined }
  }
  return {
    ls: agg(byProvider.value.ls),
    ollama: agg(byProvider.value.ollama),
    vllm: agg(byProvider.value.vllm),
  }
})


