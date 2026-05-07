<!-- packages/client/src/components/shell/KeyboardShortcutsHelp.vue -->
<template>
  <div
    v-if="open"
    data-testid="keyboard-shortcuts-help"
    role="dialog"
    aria-modal="true"
    aria-labelledby="keyboard-shortcuts-title"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="$emit('close')"
  >
    <div
      class="mx-4 w-full max-w-md rounded-lg border border-gray-700 bg-surface p-6 text-gray-200"
    >
      <div class="mb-4 flex items-center justify-between">
        <h2 id="keyboard-shortcuts-title" class="text-lg font-semibold">Keyboard shortcuts</h2>
        <button
          type="button"
          data-testid="keyboard-shortcuts-help-close"
          aria-label="Close keyboard shortcuts help"
          class="text-gray-400 hover:text-white"
          @click="$emit('close')"
        >
          ×
        </button>
      </div>
      <dl class="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
        <dt>
          <kbd class="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-xs">Cmd+K</kbd>
        </dt>
        <dd>Open search</dd>
        <dt>
          <kbd class="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-xs">n</kbd>
        </dt>
        <dd>New post</dd>
        <dt>
          <kbd class="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-xs">/</kbd>
        </dt>
        <dd>Focus search</dd>
        <dt>
          <kbd class="rounded border border-gray-600 bg-gray-800 px-1.5 py-0.5 text-xs">?</kbd>
        </dt>
        <dd>Show shortcuts</dd>
      </dl>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{ open: boolean }>();
defineEmits<{ close: [] }>();
</script>
