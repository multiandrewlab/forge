<script setup lang="ts">
import { ref } from 'vue';
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
// Fork is a non-idempotent write. The button stays mounted while the
// network call + redirect resolve, so a fast double-click here would
// create two forks and race the navigation. Gate with isForking and
// reflect it in :disabled to also block the click visually.
const isForking = ref(false);

async function handleFork(): Promise<void> {
  if (isForking.value) return;
  isForking.value = true;
  try {
    const newPostId = await usePosts().forkPost(props.sourcePostId);
    if (!newPostId) return;
    if (props.contentType === 'prompt') {
      await router.push(`/playground/${newPostId}`);
    } else {
      await router.push(`/posts/${newPostId}/edit`);
    }
  } finally {
    isForking.value = false;
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
        :disabled="isForking"
        class="rounded border border-surface-500 px-4 py-1.5 text-sm font-medium text-gray-300 hover:bg-surface-600 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
        @click="handleFork"
      >
        Fork
      </button>
    </div>
  </header>
</template>
