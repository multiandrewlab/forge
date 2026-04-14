<script setup lang="ts">
import { computed } from 'vue';
import type { PromptVariable } from '@forge/shared';

const props = defineProps<{
  variable: PromptVariable;
  modelValue: string;
}>();

defineEmits<{
  'update:modelValue': [value: string];
}>();

const TEXTAREA_KEYWORDS = /\b(log|code|content|text|context)\b/i;

const isTextarea = computed(() => TEXTAREA_KEYWORDS.test(props.variable.name));

const placeholder = computed(() => props.variable.placeholder ?? `Enter ${props.variable.name}`);
</script>

<template>
  <div class="mb-4">
    <label class="mb-1 block text-sm font-medium text-gray-300">
      {{ variable.name }}
    </label>
    <textarea
      v-if="isTextarea"
      rows="4"
      class="w-full rounded-lg border border-surface-500 bg-surface px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-primary focus:outline-none"
      :placeholder="placeholder"
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <input
      v-else
      type="text"
      class="w-full rounded-lg border border-surface-500 bg-surface px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-primary focus:outline-none"
      :placeholder="placeholder"
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>
