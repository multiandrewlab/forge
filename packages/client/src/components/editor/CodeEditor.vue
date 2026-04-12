<script setup lang="ts">
import { watch, shallowRef } from 'vue';
import { Codemirror } from 'vue-codemirror';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { sql } from '@codemirror/lang-sql';
import { xml } from '@codemirror/lang-xml';
import { java } from '@codemirror/lang-java';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { php } from '@codemirror/lang-php';
import type { Extension } from '@codemirror/state';

const props = defineProps<{
  modelValue: string;
  language?: string;
  readonly?: boolean;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const languageExtensions: Record<string, () => Extension> = {
  javascript: () => javascript({ jsx: true }),
  typescript: () => javascript({ jsx: true, typescript: true }),
  python: () => python(),
  html: () => html(),
  css: () => css(),
  json: () => json(),
  markdown: () => markdown(),
  sql: () => sql(),
  xml: () => xml(),
  java: () => java(),
  cpp: () => cpp(),
  c: () => cpp(),
  rust: () => rust(),
  php: () => php(),
};

const extensions = shallowRef<Extension[]>([oneDark]);

watch(
  () => props.language,
  (lang) => {
    const langExt = lang ? languageExtensions[lang]?.() : undefined;
    extensions.value = langExt ? [oneDark, langExt] : [oneDark];
  },
  { immediate: true },
);
</script>

<template>
  <Codemirror
    :model-value="modelValue"
    :extensions="extensions"
    :disabled="readonly"
    :style="{ minHeight: '300px', width: '100%' }"
    :tab-size="2"
    :indent-with-tab="true"
    @update:model-value="(val: string) => emit('update:modelValue', val)"
  />
</template>
