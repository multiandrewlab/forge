<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { apiFetch } from '@/lib/api';
import { usePlayground } from '@/composables/usePlayground';
import PlaygroundHeader from '@/components/playground/PlaygroundHeader.vue';
import PromptVariableInput from '@/components/playground/PromptVariableInput.vue';
import PromptOutput from '@/components/playground/PromptOutput.vue';

const route = useRoute();
const postId = route.params.id as string;

const { variables, isRunning, error, output, fetchVariables, run, stop } = usePlayground();

const title = ref('Playground');
const variableValues = reactive<Record<string, string>>({});

onMounted(async () => {
  const res = await apiFetch(`/api/posts/${postId}`);
  if (res.ok) {
    const post = (await res.json()) as { title: string };
    title.value = post.title;
  }
  await fetchVariables(postId);
});

watch(variables, (vars) => {
  for (const v of vars) {
    if (!(v.name in variableValues)) {
      variableValues[v.name] = v.defaultValue ?? '';
    }
  }
});

function handleRun(): void {
  run(postId, { ...variableValues });
}
</script>

<template>
  <div class="flex h-full flex-col">
    <PlaygroundHeader :title="title" :is-running="isRunning" @run="handleRun" @stop="stop" />
    <div class="flex flex-1 overflow-hidden">
      <div class="w-1/2 overflow-y-auto border-r border-surface-500 p-6">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Variables</h2>
        <div v-if="variables.length === 0" class="text-sm text-gray-500">
          No variables found in this prompt.
        </div>
        <PromptVariableInput
          v-for="v in variables"
          :key="v.id"
          v-model="variableValues[v.name]"
          :variable="v"
        />
      </div>
      <div class="w-1/2 p-6">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Output</h2>
        <PromptOutput :output="output" :is-running="isRunning" :error="error" />
      </div>
    </div>
  </div>
</template>
