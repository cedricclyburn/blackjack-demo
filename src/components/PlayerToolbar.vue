<script setup lang="ts">
import { canDoubleDown, canSplit, state, doubleDown, endHand, hit, split } from '@/store'
import PlayerBank from '@/components/PlayerBank.vue'
import { getAIRecommendation } from '@/ai'
import { recordMetric } from '@/metrics'
import { ref } from 'vue'

const toast = ref<{ message: string; visible: boolean }>({ message: '', visible: false })

async function askAI() {
  if (state.isDealing || !state.activeHand) return
  try {
    const rec = await getAIRecommendation()
    recordMetric({ timestamp: Date.now(), provider: rec.provider, modelId: rec.modelId, latencyMs: Math.round(rec.latencyMs), ttftMs: rec.ttftMs })
    toast.value = {
      message: `AI suggests: ${rec.action.toUpperCase()}${rec.rationale ? ' — ' + rec.rationale : ''}`,
      visible: true,
    }
  } catch (e) {
    toast.value = { message: 'AI unavailable. Check Llama Stack.', visible: true }
  } finally {
    setTimeout(() => (toast.value.visible = false), 2500)
  }
}
</script>

<template>
  <div class="toolbar-wrap">
    <PlayerBank />
    <div role="toolbar">
      <button :disabled="!canDoubleDown" @click="doubleDown">Double<br />Down</button>
      <button :disabled="!canSplit" @click="split">Split</button>
      <button class="ask-ai" :disabled="state.isDealing" @click="() => askAI()">Ask AI</button>
      <button :disabled="state.isDealing" @click="endHand">Stand</button>
      <button :disabled="state.isDealing" @click="hit">Hit</button>
    </div>
  </div>
  <div v-if="toast.visible" class="ai-toast">{{ toast.message }}</div>
</template>

<style scoped>
[class='toolbar-wrap'] {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: calc(env(safe-area-inset-bottom, 0) + 0.75rem);
  z-index: 20;
  width: 100%;
  max-width: 900px;
}
[role='toolbar'] {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 0.5rem;
  width: 100%;
  max-width: 900px;
  padding: 0 0.75rem;
  margin: 0 auto;
}
.toolbar-wrap button {
  font-size: clamp(1.6rem, 4.5vw, 2.6rem);
  padding: clamp(0.8rem, 2.5vw, 1.2rem) clamp(0.9rem, 2.5vw, 1.4rem);
}
.ask-ai {
  background-color: rgba(143, 238, 255, 0.9);
  color: var(--color-black);
}
.ask-ai:focus-visible,
.ask-ai:active {
  background-color: rgba(143, 238, 255, 1);
}
.toolbar-wrap > :first-child {
  margin-bottom: 0.25rem;
}
@media (min-width: 1024px) and (min-height: 700px) {
  .toolbar-wrap > :first-child {
    margin-bottom: 2rem;
  }
}
button:first-of-type {
  font-size: 2rem;
}
.ai-toast {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.8);
  color: var(--color-white);
  padding: 0.6rem 1rem;
  border-radius: 8px;
}
</style>
