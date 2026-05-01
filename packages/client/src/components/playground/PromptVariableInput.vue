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

const isRequired = computed<boolean>(() => {
  const dv = props.variable.defaultValue;
  return dv === null || dv === undefined || dv.trim() === '';
});
</script>

<template>
  <div class="mb-4">
    <label
      :for="`prompt-var-${variable.name}`"
      :data-testid="`prompt-variable-label-${variable.name}`"
      class="mb-1 block text-sm font-medium text-gray-300"
    >
      {{ variable.name }}
      <span
        v-if="isRequired"
        aria-hidden="true"
        :data-testid="`prompt-variable-required-${variable.name}`"
        class="text-red-400 ml-0.5"
        >*</span
      >
      <span v-if="isRequired" class="sr-only">required</span>
    </label>
    <textarea
      v-if="isTextarea"
      :id="`prompt-var-${variable.name}`"
      :data-testid="`prompt-variable-input-${variable.name}`"
      :name="variable.name"
      rows="4"
      class="w-full rounded-lg border border-surface-500 bg-surface px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-primary focus:outline-none"
      :placeholder="placeholder"
      :required="isRequired"
      :aria-required="isRequired"
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <input
      v-else
      :id="`prompt-var-${variable.name}`"
      :data-testid="`prompt-variable-input-${variable.name}`"
      :name="variable.name"
      type="text"
      class="w-full rounded-lg border border-surface-500 bg-surface px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-primary focus:outline-none"
      :placeholder="placeholder"
      :required="isRequired"
      :aria-required="isRequired"
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>
