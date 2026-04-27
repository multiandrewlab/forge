<template>
  <div data-testid="diff-viewer" class="overflow-hidden rounded-md border border-gray-700">
    <!-- Mode toggle -->
    <div class="flex items-center gap-1 border-b border-gray-700 bg-gray-800 px-3 py-2">
      <button
        data-testid="mode-inline"
        class="rounded px-2 py-1 text-xs text-gray-300"
        :class="mode === 'inline' ? 'bg-gray-600' : 'hover:bg-gray-700'"
        @click="mode = 'inline'"
      >
        Inline
      </button>
      <button
        data-testid="mode-side-by-side"
        class="rounded px-2 py-1 text-xs text-gray-300"
        :class="mode === 'side-by-side' ? 'bg-gray-600' : 'hover:bg-gray-700'"
        @click="mode = 'side-by-side'"
      >
        Side by side
      </button>
    </div>

    <!-- No differences -->
    <div v-if="isIdentical" class="px-4 py-8 text-center text-sm text-gray-500">
      No differences between these revisions.
    </div>

    <!-- Inline mode -->
    <div v-else-if="mode === 'inline'" class="overflow-x-auto font-mono text-sm">
      <div
        v-for="(part, i) in diffParts"
        :key="i"
        :data-testid="part.added ? 'diff-added' : part.removed ? 'diff-removed' : 'diff-unchanged'"
        class="whitespace-pre px-3 py-0.5"
        :class="[
          part.added ? 'bg-green-900/40 text-green-300' : '',
          part.removed ? 'bg-red-900/40 text-red-300' : '',
          !part.added && !part.removed ? 'text-gray-400' : '',
        ]"
      >
        {{ part.added ? '+' : part.removed ? '-' : ' ' }} {{ part.value }}
      </div>
    </div>

    <!-- Side-by-side mode -->
    <div v-else data-testid="diff-side-by-side" class="grid grid-cols-2">
      <div data-testid="side-left" class="border-r border-gray-700">
        <div class="border-b border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-400">
          {{ leftLabel }}
        </div>
        <div class="overflow-x-auto font-mono text-sm">
          <div
            v-for="(line, i) in sideBySideLeft"
            :key="'l-' + i"
            :data-testid="line.type === 'removed' ? 'diff-removed' : 'diff-unchanged'"
            class="whitespace-pre px-3 py-0.5"
            :class="[line.type === 'removed' ? 'bg-red-900/40 text-red-300' : 'text-gray-400']"
          >
            {{ line.type === 'removed' ? '-' : ' ' }} {{ line.value }}
          </div>
        </div>
      </div>
      <div data-testid="side-right">
        <div class="border-b border-gray-700 bg-gray-800 px-3 py-1 text-xs text-gray-400">
          {{ rightLabel }}
        </div>
        <div class="overflow-x-auto font-mono text-sm">
          <div
            v-for="(line, i) in sideBySideRight"
            :key="'r-' + i"
            :data-testid="line.type === 'added' ? 'diff-added' : 'diff-unchanged'"
            class="whitespace-pre px-3 py-0.5"
            :class="[line.type === 'added' ? 'bg-green-900/40 text-green-300' : 'text-gray-400']"
          >
            {{ line.type === 'added' ? '+' : ' ' }} {{ line.value }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { diffLines } from 'diff';

const props = defineProps<{
  leftContent: string;
  rightContent: string;
  leftLabel: string;
  rightLabel: string;
}>();

const mode = ref<'inline' | 'side-by-side'>('inline');

interface DiffPart {
  value: string;
  added: boolean;
  removed: boolean;
}

const diffParts = computed<DiffPart[]>(() => {
  const changes = diffLines(props.leftContent, props.rightContent);
  const parts: DiffPart[] = [];

  for (const change of changes) {
    // Split multi-line changes into individual lines for display
    const lines = change.value.replace(/\n$/, '').split('\n');
    for (const line of lines) {
      parts.push({
        value: line,
        added: change.added ?? false,
        removed: change.removed ?? false,
      });
    }
  }

  return parts;
});

const isIdentical = computed(() => props.leftContent === props.rightContent);

interface SideLine {
  value: string;
  type: 'added' | 'removed' | 'unchanged';
}

const sideBySideLeft = computed<SideLine[]>(() => {
  return diffParts.value
    .filter((p) => !p.added)
    .map((p) => ({
      value: p.value,
      type: p.removed ? ('removed' as const) : ('unchanged' as const),
    }));
});

const sideBySideRight = computed<SideLine[]>(() => {
  return diffParts.value
    .filter((p) => !p.removed)
    .map((p) => ({
      value: p.value,
      type: p.added ? ('added' as const) : ('unchanged' as const),
    }));
});
</script>
