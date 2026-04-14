<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import type { EditorView } from '@codemirror/view';
import type { AiGenerateRequest } from '@forge/shared';
import { useAiGenerate } from '@/composables/useAiGenerate';

const props = defineProps<{
  editorView: EditorView;
  contentType: AiGenerateRequest['contentType'];
  language: string;
}>();

type PanelState = 'collapsed' | 'expanded' | 'generating';

const panelState = ref<PanelState>('collapsed');
const description = ref('');

const { isGenerating, error, start, stop } = useAiGenerate();

function onToggle(): void {
  if (panelState.value === 'collapsed') {
    error.value = null;
    panelState.value = 'expanded';
  } else {
    error.value = null;
    panelState.value = 'collapsed';
  }
}

function onCancel(): void {
  error.value = null;
  panelState.value = 'collapsed';
}

function onToken(text: string): void {
  const cursor = props.editorView.state.selection.main.head;
  props.editorView.dispatch({
    changes: { from: cursor, insert: text },
    selection: { anchor: cursor + text.length },
    scrollIntoView: true,
  });
}

const isDescriptionEmpty = computed(() => description.value.trim() === '');

function onGenerate(): void {
  if (isDescriptionEmpty.value) {
    return;
  }
  panelState.value = 'generating';
  start(
    {
      description: description.value,
      contentType: props.contentType,
      language: props.language,
    },
    onToken,
  );
}

function onStop(): void {
  stop();
}

// Watch for generation completion
watch(isGenerating, (generating) => {
  if (!generating && panelState.value === 'generating') {
    if (error.value) {
      panelState.value = 'expanded';
    } else {
      panelState.value = 'collapsed';
    }
  }
});
</script>

<template>
  <div class="ai-generate-panel">
    <!-- Toggle button: visible in collapsed and expanded states, not during generating -->
    <button
      v-if="panelState !== 'generating'"
      data-testid="ai-generate-toggle"
      class="rounded bg-primary px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-600"
      @click="onToggle"
    >
      Generate with AI
    </button>

    <!-- Expanded state -->
    <div
      v-if="panelState === 'expanded'"
      class="mt-2 flex flex-col gap-2 rounded border border-surface-500 bg-surface-700 p-3"
    >
      <div v-if="error" class="text-sm text-red-400" data-testid="ai-generate-error">
        {{ error }}
      </div>
      <textarea
        v-model="description"
        data-testid="ai-generate-description"
        placeholder="Describe what you want to generate..."
        class="min-h-[60px] rounded border border-surface-500 bg-surface px-2 py-1 text-sm text-gray-300 placeholder-gray-500"
      />
      <div class="flex gap-2">
        <button
          data-testid="ai-generate-submit"
          :disabled="isDescriptionEmpty"
          class="rounded bg-primary px-3 py-1 text-sm font-medium text-white hover:bg-primary-600 disabled:cursor-not-allowed disabled:opacity-50"
          @click="onGenerate"
        >
          Generate
        </button>
        <button
          data-testid="ai-generate-cancel"
          class="rounded border border-surface-500 px-3 py-1 text-sm text-gray-300 hover:bg-surface-600"
          @click="onCancel"
        >
          Cancel
        </button>
      </div>
    </div>

    <!-- Generating state -->
    <div
      v-if="panelState === 'generating'"
      class="flex items-center gap-2 rounded border border-surface-500 bg-surface-700 p-3"
    >
      <span class="text-sm text-gray-300">Generating...</span>
      <button
        data-testid="ai-generate-stop"
        class="rounded border border-red-500 px-3 py-1 text-sm text-red-400 hover:bg-red-500/10"
        @click="onStop"
      >
        Stop
      </button>
    </div>
  </div>
</template>
