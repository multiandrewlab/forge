<template>
  <div>
    <button
      class="flex w-full flex-col items-center justify-center rounded border-2 border-dashed px-2 py-3 text-sm transition-colors"
      :class="
        isDragOver
          ? 'border-purple-500 bg-purple-500/10 text-purple-300'
          : 'border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-400'
      "
      @click="openFilePicker"
      @dragenter.prevent="isDragOver = true"
      @dragover.prevent
      @dragleave.prevent="isDragOver = false"
      @drop.prevent="handleDrop"
    >
      <span class="text-lg font-bold">+</span>
      <span class="text-xs">Drop or browse</span>
    </button>
    <input
      ref="fileInputRef"
      type="file"
      multiple
      class="hidden"
      @change="handleFileSelect"
    >
    <p
      v-if="errorMessage"
      class="mt-1 text-xs text-red-400"
    >
      {{ errorMessage }}
    </p>
  </div>
</template>

<script setup lang="ts">
/* global File, FileList, HTMLInputElement, Event, DragEvent */
import { ref } from 'vue';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const emit = defineEmits<{
  upload: [file: File];
}>();

const fileInputRef = ref<HTMLInputElement | null>(null);
const isDragOver = ref(false);
const errorMessage = ref('');

function openFilePicker(): void {
  fileInputRef.value?.click();
}

function validateAndEmit(files: FileList | File[]): void {
  errorMessage.value = '';

  for (const file of files) {
    if (file.size > MAX_FILE_SIZE) {
      errorMessage.value = `File "${file.name}" exceeds 10MB limit`;
      return;
    }
  }

  for (const file of files) {
    emit('upload', file);
  }
}

function handleFileSelect(event: Event): void {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (!files || files.length === 0) return;
  validateAndEmit(files);
}

function handleDrop(event: DragEvent): void {
  isDragOver.value = false;
  const files = event.dataTransfer?.files;
  if (!files || files.length === 0) return;
  validateAndEmit(files);
}
</script>
