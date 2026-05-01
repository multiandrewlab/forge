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
      // preventDefault stops the browser's focus-move; stopPropagation prevents
      // CodeMirror's keymap (`indentWithTab`) from also running and overwriting
      // our just-inserted text with indentation.
      ev.preventDefault();
      ev.stopPropagation();
    }
    return;
  }
  dismissSuggestion();
}

// `useCapture: true` lets our handler run before CodeMirror's keymap (which is
// registered as a bubble-phase listener). Without this, Tab is intercepted by
// indentMore (`:indent-with-tab="true"` on CodeEditor.vue), the doc changes,
// the ghost-text field clears, and `acceptGhostText` finds nothing to insert.
onMounted(() => {
  props.editorView.contentDOM.addEventListener('keydown', onKeydown, true);
});

onBeforeUnmount(() => {
  props.editorView.contentDOM.removeEventListener('keydown', onKeydown, true);
  cancel();
});

defineExpose({ requestCompletion: (input: AiCompleteRequest) => requestCompletion(input) });
</script>

<template><span style="display: none" /></template>
