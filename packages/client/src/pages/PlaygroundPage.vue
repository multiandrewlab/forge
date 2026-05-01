<script setup lang="ts">
import { reactive, computed, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { usePlayground } from '@/composables/usePlayground';
import PlaygroundHeader from '@/components/playground/PlaygroundHeader.vue';
import PromptVariableInput from '@/components/playground/PromptVariableInput.vue';
import PromptOutput from '@/components/playground/PromptOutput.vue';

const route = useRoute();
const postId = route.params.id as string;

const {
  variables,
  isRunning,
  error,
  output,
  currentPost,
  loadError,
  inputValues,
  canRun,
  fetchVariables,
  fetchPost,
  run,
  stop,
} = usePlayground();

const variableValues = reactive<Record<string, string>>({});

const title = computed(() => currentPost.value?.title ?? 'Playground');
const contentType = computed(() => currentPost.value?.contentType ?? 'prompt');

function getVarValue(name: string): string {
  return variableValues[name] ?? '';
}

function setVarValue(name: string, value: string): void {
  variableValues[name] = value;
  inputValues.value[name] = value;
}

onMounted(async () => {
  await Promise.all([fetchPost(postId), fetchVariables(postId)]);
});

watch(variables, (vars) => {
  for (const v of vars) {
    if (!(v.name in variableValues)) {
      const initial = v.defaultValue ?? '';
      variableValues[v.name] = initial;
      inputValues.value[v.name] = initial;
    }
  }
});

defineExpose({ getVarValue });

function handleRun(): void {
  run(postId, { ...variableValues });
}
</script>

<template>
  <div data-testid="playground-page" class="flex h-full flex-col">
    <div
      v-if="loadError"
      data-testid="playground-load-error"
      role="alert"
      class="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm"
    >
      {{ loadError }}
    </div>
    <div
      v-if="error"
      data-testid="playground-error"
      role="alert"
      class="mb-4 p-3 bg-red-900/30 border border-red-500 rounded text-red-400 text-sm"
    >
      {{ error }}
    </div>
    <PlaygroundHeader
      :title="title"
      :is-running="isRunning"
      :can-run="canRun"
      :source-post-id="postId"
      :content-type="contentType"
      @run="handleRun"
      @stop="stop"
    />
    <p
      v-if="!canRun && !isRunning"
      id="playground-run-hint"
      role="status"
      class="text-xs text-red-400/70 mt-1 px-6"
    >
      Fill required variables to run
    </p>
    <details data-testid="playground-prompt-source" class="mb-4 group px-6">
      <summary
        class="cursor-pointer list-none text-sm text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary flex items-center gap-1"
      >
        <span class="inline-block transition-transform group-open:rotate-90">▶</span>
        Show prompt source
      </summary>
      <pre
        data-testid="playground-prompt-content"
        class="mt-2 p-3 bg-gray-900 rounded text-sm overflow-auto max-h-60"
        >{{ currentPost?.content ?? '' }}</pre
      >
    </details>
    <div class="flex flex-1 overflow-hidden">
      <div class="w-1/2 overflow-y-auto border-r border-surface-500 p-6">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Variables</h2>
        <div v-if="variables.length === 0" class="text-sm text-gray-500">
          No variables found in this prompt.
        </div>
        <PromptVariableInput
          v-for="v in variables"
          :key="v.id"
          :model-value="getVarValue(v.name)"
          :variable="v"
          @update:model-value="setVarValue(v.name, $event)"
        />
      </div>
      <div class="w-1/2 p-6">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Output</h2>
        <PromptOutput :output="output" :is-running="isRunning" :error="error" />
      </div>
    </div>
  </div>
</template>
