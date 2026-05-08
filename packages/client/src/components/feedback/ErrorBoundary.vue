<template>
  <div
    v-if="hasError"
    data-testid="error-boundary-fallback"
    class="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-gray-300"
  >
    <h2 class="text-lg font-semibold text-white">Something went wrong</h2>
    <p class="text-sm">{{ message }}</p>
    <button
      type="button"
      data-testid="error-boundary-retry"
      class="rounded border border-gray-600 px-3 py-1 text-sm hover:bg-gray-700"
      @click="retry"
    >
      Try again
    </button>
  </div>
  <slot v-else />
</template>

<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue';

const hasError = ref(false);
const message = ref('');

onErrorCaptured((err) => {
  hasError.value = true;
  message.value = err instanceof Error ? err.message : String(err);
  return false; // stop propagation
});

function retry(): void {
  hasError.value = false;
  message.value = '';
}
</script>
