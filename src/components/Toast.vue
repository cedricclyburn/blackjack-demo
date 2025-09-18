<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = defineProps<{ message: string; visible: boolean }>()
const emit = defineEmits<{ (e: 'close'): void }>()

onMounted(() => {
  if (props.visible) setTimeout(() => emit('close'), 2500)
})
</script>

<template>
  <div v-if="visible" class="toast">{{ message }}</div>
  <div v-else class="toast toast--hidden"></div>
  
</template>

<style scoped>
.toast {
  position: fixed;
  bottom: 1rem;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0,0,0,0.8);
  color: var(--color-white);
  padding: 0.6rem 1rem;
  border-radius: 8px;
  z-index: 1000;
}
.toast--hidden { display: none; }
</style>


