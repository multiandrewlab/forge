<template>
  <div>
    <button
      data-testid="restore-trigger"
      class="flex items-center gap-1 rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      :disabled="loading"
      @click="showDialog = true"
    >
      {{ loading ? 'Restoring...' : 'Restore' }}
    </button>

    <div
      v-if="showDialog"
      data-testid="restore-dialog"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    >
      <div class="rounded-lg bg-gray-800 p-6 shadow-xl">
        <p class="mb-2 text-lg font-semibold text-white">
          Restore to revision {{ revisionNumber }}?
        </p>
        <p class="mb-4 text-sm text-gray-400">
          This will create a new revision with the content from revision {{ revisionNumber }}.
        </p>
        <div class="flex justify-end gap-3">
          <button
            data-testid="restore-cancel"
            class="rounded bg-gray-600 px-3 py-1.5 text-sm text-white hover:bg-gray-500"
            @click="showDialog = false"
          >
            Cancel
          </button>
          <button
            data-testid="restore-confirm"
            class="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
            @click="confirmRestore"
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';

const props = defineProps<{
  revisionNumber: number;
  loading: boolean;
}>();

const emit = defineEmits<{
  restore: [revisionNumber: number];
}>();

const showDialog = ref(false);

function confirmRestore(): void {
  showDialog.value = false;
  emit('restore', props.revisionNumber);
}
</script>
