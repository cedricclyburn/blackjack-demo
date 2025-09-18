<script setup lang="ts">
import { RouterView, RouterLink } from 'vue-router'
import GameHeader from '@/components/GameHeader.vue'
</script>

<template>
  <SvgSprite />
  <AnimatedBackground />
  <GameHeader />
  <main>
    <RouterView />
  </main>
  <nav class="admin-nav">
    <RouterLink to="/">Game</RouterLink>
    <RouterLink to="/admin">Admin</RouterLink>
  </nav>
</template>

<style scoped>
.admin-nav { position: fixed; top: 0.5rem; right: 0.5rem; display: flex; gap: 0.5rem; }
.admin-nav a { color: var(--color-off-white); text-decoration: none; }
</style>


