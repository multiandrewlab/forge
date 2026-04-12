<script setup lang="ts">
/* global setTimeout, MouseEvent, HTMLElement */
import { ref, watch, onMounted } from 'vue';
import { codeToHtml } from 'shiki';

// SAFETY: This component runs exclusively in the browser. The project tsconfig
// uses lib: ["ES2022"] without "DOM", so we declare the browser globals we need.
declare const navigator: { clipboard: { writeText: (text: string) => Promise<void> } };

const props = defineProps<{
  code: string;
  language?: string;
}>();

const emit = defineEmits<{
  'line-click': [lineNumber: number];
}>();

const highlightedHtml = ref('');
const copied = ref(false);

async function highlight(): Promise<void> {
  try {
    highlightedHtml.value = await codeToHtml(props.code, {
      lang: props.language || 'text',
      theme: 'one-dark-pro',
    });
  } catch {
    highlightedHtml.value = await codeToHtml(props.code, {
      lang: 'text',
      theme: 'one-dark-pro',
    });
  }
}

onMounted(highlight);
watch(() => [props.code, props.language], highlight);

function handleLineClick(event: MouseEvent): void {
  const target = event.target as HTMLElement;
  const line = target.closest('.line');
  if (!line) return;
  const container = line.parentElement;
  /* v8 ignore next -- parentElement is never null for a mounted DOM element */
  if (!container) return;
  const lines = Array.from(container.querySelectorAll('.line'));
  const lineNumber = lines.indexOf(line) + 1;
  if (lineNumber > 0) {
    emit('line-click', lineNumber);
  }
}

async function copyToClipboard(): Promise<void> {
  await navigator.clipboard.writeText(props.code);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>

<template>
  <div class="relative group">
    <button
      class="absolute top-2 right-2 text-xs px-2 py-1 rounded bg-surface-700 text-gray-400 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
      @click="copyToClipboard"
    >
      {{ copied ? 'Copied!' : 'Copy' }}
    </button>
    <div class="rounded overflow-auto text-sm" @click="handleLineClick" v-html="highlightedHtml" />
  </div>
</template>
