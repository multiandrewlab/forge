<template>
  <template v-if="authStore.isAuthenticated">
    <button
      :data-testid="`subscribe-btn-${tag.name}`"
      :aria-pressed="isSubscribed ? 'true' : 'false'"
      :aria-busy="loading ? 'true' : undefined"
      :disabled="loading"
      class="rounded bg-primary px-2 py-1 text-xs text-white hover:bg-primary/90 disabled:opacity-50"
      @click="handleClick"
    >
      {{ isSubscribed ? 'Unsubscribe' : 'Subscribe' }}
    </button>
    <span
      v-if="error"
      :data-testid="`subscribe-error-${tag.name}`"
      class="ml-2 text-xs text-red-400"
    >
      {{ error }}
    </span>
  </template>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { storeToRefs } from 'pinia';
import { useTagsStore } from '../../stores/tags';
import { useAuthStore } from '../../stores/auth';
import type { Tag } from '@forge/shared';

const props = defineProps<{
  tag: Tag;
  loading?: boolean;
  error?: string | null;
}>();

const emit = defineEmits<{
  subscribe: [];
  unsubscribe: [];
}>();

const authStore = useAuthStore();
const tagsStore = useTagsStore();
const { subscribedTags } = storeToRefs(tagsStore);

const isSubscribed = computed(() => subscribedTags.value.some((t) => t.id === props.tag.id));

function handleClick(): void {
  if (isSubscribed.value) emit('unsubscribe');
  else emit('subscribe');
}
</script>
