<!-- packages/client/src/layouts/AuthLayout.vue -->
<template>
  <div class="flex min-h-screen items-center justify-center bg-surface">
    <div class="w-full max-w-md p-6">
      <RouterView />
    </div>
  </div>
</template>

<script setup lang="ts">
import { RouterView } from 'vue-router';
</script>
