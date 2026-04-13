<template>
  <div
    role="option"
    :aria-selected="active"
    :class="[
      'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2',
      active ? 'bg-primary/10 dark:bg-primary/20' : 'hover:bg-gray-100 dark:hover:bg-gray-800',
    ]"
    @click="$emit('select')"
  >
    <!-- snippet variant -->
    <template v-if="variant === 'snippet'">
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <div class="flex items-center gap-2">
          <span class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
            {{ snippetData.title }}
          </span>
          <span
            v-if="snippetData.language"
            data-testid="language-badge"
            class="shrink-0 rounded bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-700 dark:text-gray-300"
          >
            {{ snippetData.language }}
          </span>
          <span
            class="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500 dark:bg-gray-700 dark:text-gray-400"
          >
            {{ snippetData.contentType }}
          </span>
        </div>
        <span class="truncate text-xs text-gray-500 dark:text-gray-400">
          {{ snippetData.excerpt }}
        </span>
        <span class="text-xs text-gray-400 dark:text-gray-500">
          {{ snippetData.authorDisplayName }}
        </span>
      </div>
    </template>

    <!-- person variant -->
    <template v-if="variant === 'person'">
      <div
        data-testid="avatar-initials"
        class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-white"
      >
        {{ initials }}
      </div>
      <div class="flex min-w-0 flex-col">
        <span class="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
          {{ personData.displayName }}
        </span>
        <span class="text-xs text-gray-500 dark:text-gray-400">
          {{ personData.postCount }} {{ personData.postCount === 1 ? 'post' : 'posts' }}
        </span>
      </div>
    </template>

    <!-- aiAction variant -->
    <template v-if="variant === 'aiAction'">
      <span class="text-base">&#x2728;</span>
      <span class="text-sm font-medium text-gray-900 dark:text-gray-100">
        {{ aiActionData.label }}
      </span>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { SearchSnippet, UserSummary, AiAction } from '@forge/shared';

const props = defineProps<{
  variant: 'snippet' | 'person' | 'aiAction';
  data: SearchSnippet | UserSummary | AiAction;
  active: boolean;
}>();

defineEmits<{ select: [] }>();

const snippetData = computed(() => props.data as SearchSnippet);
const personData = computed(() => props.data as UserSummary);
const aiActionData = computed(() => props.data as AiAction);

const initials = computed(() => {
  const name = (props.data as UserSummary).displayName;
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
});
</script>
