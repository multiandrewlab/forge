<template>
  <form class="flex flex-col gap-2" @submit.prevent="handleSubmit">
    <textarea
      v-model="body"
      :placeholder="placeholder"
      class="w-full resize-none rounded border border-gray-600 bg-surface-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-primary focus:outline-none"
      rows="3"
    />
    <div class="flex items-center gap-2">
      <button
        type="submit"
        :disabled="!body.trim()"
        class="rounded bg-primary px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
      >
        Comment
      </button>
      <button
        v-if="showCancel"
        type="button"
        data-testid="cancel-btn"
        class="rounded px-3 py-1 text-sm text-gray-400 hover:text-gray-200"
        @click="$emit('cancel')"
      >
        Cancel
      </button>
    </div>
  </form>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  placeholder?: string;
  showCancel?: boolean;
  initialValue?: string;
}>();

const emit = defineEmits<{
  submit: [body: string];
  cancel: [];
}>();

const body = ref(props.initialValue ?? '');

function handleSubmit(): void {
  const text = body.value.trim();
  if (!text) return;
  emit('submit', text);
  body.value = '';
}
</script>
