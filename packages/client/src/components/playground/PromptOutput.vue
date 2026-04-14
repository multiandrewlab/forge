<script setup lang="ts">
/* global navigator, setTimeout */
import { ref } from 'vue';

defineProps<{
  output: string;
  isRunning: boolean;
  error: string | null;
}>();

const copied = ref(false);

async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>

<template>
  <div class="relative flex h-full flex-col">
    <div
      v-if="error"
      class="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
    >
      {{ error }}
    </div>

    <div
      v-else-if="!output && !isRunning"
      class="flex flex-1 items-center justify-center text-sm text-gray-500"
    >
      Click Run to generate output
    </div>

    <template v-else>
      <pre
        class="flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-4 font-mono text-sm text-gray-100"
        >{{ output }}</pre
      >

      <div v-if="isRunning" class="mt-2 text-xs text-gray-400">Generating...</div>

      <button
        v-if="output"
        data-testid="copy-button"
        class="absolute right-2 top-2 rounded-md bg-surface-500 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-surface-500/80"
        @click="copyToClipboard(output)"
      >
        {{ copied ? 'Copied!' : 'Copy' }}
      </button>
    </template>
  </div>
</template>
