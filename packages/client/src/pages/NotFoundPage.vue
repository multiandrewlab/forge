<template>
  <div
    data-testid="not-found-page"
    class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center"
  >
    <h1 class="text-3xl font-bold text-white">404 — Not found</h1>
    <p class="text-sm text-gray-400">The page you're looking for doesn't exist.</p>
    <RouterLink
      data-testid="not-found-back-home"
      to="/"
      class="rounded bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
    >
      Back to home
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
</script>
