<script setup lang="ts">
import { useRouter } from 'vue-router';
import type { ContentType } from '@forge/shared';
import { usePosts } from '@/composables/usePosts';

const props = withDefaults(
  defineProps<{
    title: string;
    isRunning: boolean;
    canRun?: boolean;
    sourcePostId?: string;
    contentType?: ContentType;
  }>(),
  {
    canRun: true,
    sourcePostId: '',
    contentType: 'prompt',
  },
);

defineEmits<{
  run: [];
  stop: [];
}>();

const router = useRouter();

async function handleFork(): Promise<void> {
  const newPostId = await usePosts().forkPost(props.sourcePostId);
  if (!newPostId) return;
  if (props.contentType === 'prompt') {
    await router.push(`/playground/${newPostId}`);
  } else {
    await router.push(`/posts/${newPostId}/edit`);
  }
}
</script>

<template>
  <header
    data-testid="playground-header"
    class="flex flex-col border-b border-surface-500 px-6 py-4"
  >
    <div class="flex items-center justify-between">
      <h1 data-testid="playground-title" class="text-xl font-semibold text-gray-100">
        {{ title }}
      </h1>
    </div>
    <div class="flex justify-between items-center mt-2">
      <div class="flex gap-2">
        <button
          v-if="!isRunning"
          data-testid="playground-run-btn"
          :disabled="!canRun"
          aria-describedby="playground-run-hint"
          class="bg-primary hover:bg-primary/80 text-white rounded px-4 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          @click="$emit('run')"
        >
          Run
        </button>
        <button
          v-else
          data-testid="playground-stop-btn"
          class="bg-red-600 hover:bg-red-700 text-white rounded px-4 py-1.5 text-sm font-medium"
          @click="$emit('stop')"
        >
          Stop
        </button>
      </div>
      <button
        v-if="sourcePostId"
        data-testid="playground-fork-btn"
        class="rounded border border-surface-500 px-4 py-1.5 text-sm font-medium text-gray-300 hover:bg-surface-600 hover:text-white"
        @click="handleFork"
      >
        Fork
      </button>
    </div>
  </header>
</template>
