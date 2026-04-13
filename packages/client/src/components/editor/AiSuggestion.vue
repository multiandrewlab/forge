<script setup lang="ts">
/* global KeyboardEvent */
import { onBeforeUnmount, onMounted, watch } from 'vue';
import type { EditorView } from '@codemirror/view';
import type { AiCompleteRequest } from '@forge/shared';
import { useAiComplete } from '@/composables/useAiComplete';
import { acceptGhostText, currentGhostText, setGhostText } from '@/lib/ai/ghost-text';

const props = defineProps<{ editorView: EditorView }>();

const { suggestion, requestCompletion, dismissSuggestion, cancel } = useAiComplete();

watch(suggestion, (val) => {
  props.editorView.dispatch({ effects: setGhostText.of(val) });
});

function onKeydown(ev: KeyboardEvent): void {
  const hasSuggestion = currentGhostText(props.editorView.state) !== null;
  if (!hasSuggestion) return;
  if (ev.key === 'Tab') {
    if (acceptGhostText(props.editorView)) {
      ev.preventDefault();
    }
    return;
  }
  dismissSuggestion();
}

onMounted(() => {
  props.editorView.contentDOM.addEventListener('keydown', onKeydown);
});

onBeforeUnmount(() => {
  props.editorView.contentDOM.removeEventListener('keydown', onKeydown);
  cancel();
});

defineExpose({ requestCompletion: (input: AiCompleteRequest) => requestCompletion(input) });
</script>

<template><span style="display: none" /></template>
