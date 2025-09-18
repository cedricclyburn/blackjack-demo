<script setup lang="ts">
import { onMounted, ref, computed } from 'vue'
import { metricsState, summary, byProvider } from '@/metrics'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

const labels = computed(() => metricsState.samples.map((s) => new Date(s.timestamp).toLocaleTimeString()))
const lsLatency = computed(() => byProvider.value.ls.map((s) => s.latencyMs))
const ollamaLatency = computed(() => byProvider.value.ollama.map((s) => s.latencyMs))
const vllmLatency = computed(() => byProvider.value.vllm.map((s) => s.latencyMs))
const lsTtft = computed(() => byProvider.value.ls.map((s) => s.ttftMs ?? null))
const ollamaTtft = computed(() => byProvider.value.ollama.map((s) => s.ttftMs ?? null))
const vllmTtft = computed(() => byProvider.value.vllm.map((s) => s.ttftMs ?? null))

const latencyData = computed(() => ({
  labels: labels.value,
  datasets: [
    { label: 'Llama Stack Latency (ms)', data: lsLatency.value, borderColor: '#9c27b0', backgroundColor: 'rgba(156, 39, 176, 0.25)' },
    { label: 'Ollama Latency (ms)', data: ollamaLatency.value, borderColor: '#4caf50', backgroundColor: 'rgba(76, 175, 80, 0.25)' },
    { label: 'vLLM Latency (ms)', data: vllmLatency.value, borderColor: '#03a9f4', backgroundColor: 'rgba(3, 169, 244, 0.25)' },
  ],
}))

const ttftData = computed(() => ({
  labels: labels.value,
  datasets: [
    { label: 'Llama Stack TTFT (ms)', data: lsTtft.value, borderColor: '#673ab7', backgroundColor: 'rgba(103, 58, 183, 0.25)' },
    { label: 'Ollama TTFT (ms)', data: ollamaTtft.value, borderColor: '#ff9800', backgroundColor: 'rgba(255, 152, 0, 0.25)' },
    { label: 'vLLM TTFT (ms)', data: vllmTtft.value, borderColor: '#e91e63', backgroundColor: 'rgba(233, 30, 99, 0.25)' },
  ],
}))

const options = { responsive: true, plugins: { legend: { display: true } } }

onMounted(() => {})
</script>

<template>
  <section class="admin">
    <h2>AI Metrics</h2>
    <div class="row">
      <div>
        <h3>Summary</h3>
        <ul>
          <li>Llama Stack - count: {{ summary.ls.count }}, avg latency: {{ summary.ls.avgLatencyMs }} ms, avg TTFT: {{ summary.ls.avgTtftMs ?? 'n/a' }} ms</li>
          <li>Ollama - count: {{ summary.ollama.count }}, avg latency: {{ summary.ollama.avgLatencyMs }} ms, avg TTFT: {{ summary.ollama.avgTtftMs ?? 'n/a' }} ms</li>
          <li>vLLM - count: {{ summary.vllm.count }}, avg latency: {{ summary.vllm.avgLatencyMs }} ms, avg TTFT: {{ summary.vllm.avgTtftMs ?? 'n/a' }} ms</li>
        </ul>
      </div>
      <div>
        <h3>Recent Samples</h3>
        <table>
          <thead>
            <tr><th>Time</th><th>Provider</th><th>Latency (ms)</th><th>TTFT (ms)</th></tr>
          </thead>
          <tbody>
            <tr v-for="s in metricsState.samples" :key="s.timestamp">
              <td>{{ new Date(s.timestamp).toLocaleTimeString() }}</td>
              <td>{{ s.provider }}</td>
              <td>{{ s.latencyMs }}</td>
              <td>{{ s.ttftMs ?? 'n/a' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div>
        <h3>Latency</h3>
        <Line :data="latencyData" :options="options" />
      </div>
      <div>
        <h3>Time To First Token (TTFT)</h3>
        <Line :data="ttftData" :options="options" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.admin { max-width: 900px; margin: 0 auto; color: var(--color-off-white); }
.row { display: grid; grid-template-columns: 1fr; gap: 1rem; }
table { width: 100%; border-collapse: collapse; }
th, td { border-bottom: 1px solid rgba(255,255,255,0.1); padding: 0.5rem; text-align: left; }
</style>


