<script setup lang="ts">
defineProps<{
  title: string;
  isRunning: boolean;
}>();

const emit = defineEmits<{
  run: [];
  stop: [];
}>();
</script>

<template>
  <div class="flex items-center justify-between border-b border-surface-500 px-6 py-4">
    <h1 class="text-xl font-semibold text-gray-100">{{ title }}</h1>
    <button
      class="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
      :class="
        isRunning
          ? 'bg-red-600 hover:bg-red-700 text-white'
          : 'bg-primary hover:bg-primary/80 text-white'
      "
      @click="isRunning ? emit('stop') : emit('run')"
    >
      {{ isRunning ? 'Stop' : 'Run' }}
    </button>
  </div>
</template>
