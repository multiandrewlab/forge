<template>
  <div
    v-if="isVisible"
    data-testid="execution-output"
    class="rounded border border-gray-700 bg-gray-900"
  >
    <!-- Output lines -->
    <pre
      v-if="output.length > 0"
      class="max-h-64 overflow-auto p-3 font-mono text-sm text-gray-300"
    ><span
        v-for="(line, i) in output"
        :key="i"
        :data-testid="`output-line-${i}`"
        :class="{ 'text-red-400': line.stream === 'stderr' }"
      >{{ line.text }}{{ i < output.length - 1 ? '\n' : '' }}</span></pre>

    <!-- Truncation indicator -->
    <div v-if="truncated" class="border-t border-gray-700 px-3 py-1 text-xs text-yellow-400">
      Output truncated
    </div>

    <!-- Status bar -->
    <div
      data-testid="status-bar"
      class="flex items-center gap-3 border-t border-gray-700 px-3 py-1 text-xs text-gray-400"
    >
      <span v-if="exitCode !== null" :class="exitCode === 0 ? 'text-green-400' : 'text-red-400'">
        Exit: {{ exitCode }}
      </span>

      <span v-if="executionTime !== null"> {{ executionTime }}ms </span>

      <button
        data-testid="clear-button"
        class="ml-auto text-gray-500 hover:text-gray-300"
        @click="$emit('clear')"
      >
        Clear
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';

interface OutputLine {
  stream: 'stdout' | 'stderr';
  text: string;
  timestamp: number;
}

const props = defineProps<{
  output: OutputLine[];
  status: 'idle' | 'loading' | 'running' | 'done' | 'error';
  executionTime: number | null;
  exitCode: number | null;
  truncated: boolean;
}>();

defineEmits<{
  clear: [];
}>();

const isVisible = computed(
  () => ['loading', 'running', 'done', 'error'].includes(props.status) || props.output.length > 0,
);
</script>
