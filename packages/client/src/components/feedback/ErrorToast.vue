<template>
  <div
    v-if="toastStore.toasts.length > 0"
    data-testid="error-toast-stack"
    class="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
  >
    <div
      v-for="t in toastStore.toasts"
      :key="t.id"
      data-testid="error-toast"
      role="status"
      aria-live="polite"
      class="flex items-center gap-3 rounded-lg border border-red-700 bg-red-900 px-4 py-2 text-sm text-red-100 shadow-lg"
    >
      <span class="flex-1">{{ t.message }}</span>
      <button
        type="button"
        data-testid="error-toast-dismiss"
        :aria-label="`Dismiss: ${t.message}`"
        class="text-red-200 hover:text-white"
        @click="toastStore.dismiss(t.id)"
      >
        ×
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useToastStore } from '@/stores/toast';

const toastStore = useToastStore();
</script>
