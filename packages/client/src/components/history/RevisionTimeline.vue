<template>
  <div class="flex flex-col gap-1">
    <p v-if="revisions.length === 0" class="py-4 text-center text-sm text-gray-500">
      No revisions found.
    </p>
    <button
      v-for="(rev, index) in revisions"
      :key="rev.id"
      data-testid="revision-item"
      class="flex items-start gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors"
      :class="[
        selectedIds.includes(rev.id)
          ? 'ring-2 ring-primary border-primary bg-primary/10'
          : 'border-gray-700 hover:border-gray-500',
      ]"
      @click="$emit('select', rev.id)"
    >
      <!-- Author avatar -->
      <div
        data-testid="author-avatar"
        class="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-600 text-xs text-gray-200"
      >
        <img
          v-if="rev.authorAvatarUrl"
          :src="rev.authorAvatarUrl"
          :alt="rev.authorDisplayName ?? 'Author'"
          class="h-full w-full rounded-full object-cover"
        />
        <template v-else>{{ getInitials(rev.authorDisplayName) }}</template>
      </div>

      <div class="flex-1 min-w-0">
        <div class="flex items-center gap-2">
          <span class="font-mono font-medium text-gray-200">Rev {{ rev.revisionNumber }}</span>
          <span
            v-if="index === 0"
            class="rounded bg-green-800 px-1.5 py-0.5 text-xs text-green-200"
          >
            Current
          </span>
          <span
            v-if="rev.message?.startsWith('Restored from revision')"
            class="rounded bg-yellow-800 px-1.5 py-0.5 text-xs text-yellow-200"
          >
            Restored
          </span>
        </div>
        <p class="mt-0.5 text-xs text-gray-400">
          {{ rev.authorDisplayName ?? 'Unknown' }}
        </p>
        <p v-if="rev.message" class="mt-0.5 truncate text-gray-400">
          {{ rev.message }}
        </p>
        <p class="mt-0.5 text-xs text-gray-500">
          {{ formatRelativeTime(rev.createdAt) }}
        </p>
      </div>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { PostRevision } from '@forge/shared';

defineProps<{
  revisions: PostRevision[];
  selectedIds: string[];
}>();

defineEmits<{
  select: [revisionId: string];
}>();

function getInitials(name: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function formatRelativeTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffSec < 60) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 30) return `${diffDay}d ago`;
  return d.toLocaleDateString();
}
</script>
