<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useRoute } from 'vue-router';
import { usePlayground } from '@/composables/usePlayground';
import PlaygroundHeader from '@/components/playground/PlaygroundHeader.vue';
import PromptVariableInput from '@/components/playground/PromptVariableInput.vue';
import PromptOutput from '@/components/playground/PromptOutput.vue';

const route = useRoute();
// postId tracks route.params.id so a Fork redirect from /playground/A to
// /playground/B (same component instance, different param) re-runs the
// data load against the new id rather than re-using stale data fetched
// for A. Captured-once postId would otherwise leak into run()/handleRun()
// and call /api/playground/run with the wrong post.
const postId = computed<string>(() => (route.params.id as string) ?? '');

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

// Use a ref<Record> rather than reactive() so a Fork redirect can replace
// the whole object via .value = {} — clearing stale keys from the previous
// post in one assignment, no per-key delete (which ESLint's
// no-dynamic-delete rule rejects).
const variableValues = ref<Record<string, string>>({});

const title = computed(() => currentPost.value?.title ?? 'Playground');
const contentType = computed(() => currentPost.value?.contentType ?? 'prompt');

function getVarValue(name: string): string {
  return variableValues.value[name] ?? '';
}

function setVarValue(name: string, value: string): void {
  variableValues.value[name] = value;
  inputValues.value[name] = value;
}

watch(
  postId,
  async (newId) => {
    if (!newId) return;
    // Reset per-post local input state so a Fork redirect doesn't carry
    // stale values from the previous post into the new playground.
    variableValues.value = {};
    inputValues.value = {};
    await Promise.all([fetchPost(newId), fetchVariables(newId)]);
  },
  { immediate: true },
);

watch(variables, (vars) => {
  for (const v of vars) {
    if (!(v.name in variableValues.value)) {
      const initial = v.defaultValue ?? '';
      variableValues.value[v.name] = initial;
      inputValues.value[v.name] = initial;
    }
  }
});

defineExpose({ getVarValue });

function handleRun(): void {
  run(postId.value, { ...variableValues.value });
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
