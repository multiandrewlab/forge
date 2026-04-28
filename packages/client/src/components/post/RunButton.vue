<template>
  <button
    :class="buttonClasses"
    :disabled="disabled"
    :aria-label="status === 'running' ? 'Stop execution' : 'Run code'"
    :title="disabledReason"
    @click="handleClick"
  >
    <!-- Play triangle -->
    <svg
      v-if="showPlay"
      data-testid="run-play"
      class="h-4 w-4"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M8 5v14l11-7z" />
    </svg>

    <!-- Spinner circle -->
    <svg
      v-if="status === 'loading'"
      data-testid="run-spinner"
      class="h-4 w-4 animate-spin"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke-width="4"
        class="opacity-25"
      />
      <path
        class="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>

    <!-- Stop square -->
    <svg
      v-if="status === 'running'"
      data-testid="run-stop"
      class="h-4 w-4"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <rect
        x="6"
        y="6"
        width="12"
        height="12"
        rx="1"
      />
    </svg>
  </button>
</template>

<script setup lang="ts">
import { computed } from 'vue';

type RunStatus = 'idle' | 'loading' | 'running' | 'done' | 'error';

const props = withDefaults(
  defineProps<{
    status: RunStatus;
    disabled?: boolean;
    disabledReason?: string;
  }>(),
  {
    disabled: false,
    disabledReason: undefined,
  },
);

const emit = defineEmits<{
  run: [];
  abort: [];
}>();

const showPlay = computed(() => ['idle', 'done', 'error'].includes(props.status));

const buttonClasses = computed(() => [
  'inline-flex items-center justify-center rounded-md p-2 transition-colors',
  props.status === 'running' ? 'bg-red-500/10 text-red-400' : 'bg-primary/10 text-primary',
  props.disabled ? 'opacity-50 cursor-not-allowed' : '',
  props.status === 'loading' ? 'cursor-wait' : '',
]);

function handleClick(): void {
  if (props.disabled || props.status === 'loading') {
    return;
  }
  if (props.status === 'running') {
    emit('abort');
  } else {
    emit('run');
  }
}
</script>
