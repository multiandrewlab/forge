<template>
  <div class="video-uploader">
    <input
      ref="fileInput"
      type="file"
      accept="video/mp4,video/webm,video/quicktime"
      :disabled="uploading"
      data-testid="video-file-input"
      @change="onFileChange"
    />
    <div v-if="error" data-testid="video-uploader-error" class="text-sm text-red-700">
      {{ error }}
    </div>
    <div v-if="uploading" data-testid="video-uploader-progress" class="text-sm">
      Uploading: {{ progress }}%
      <button
        type="button"
        class="ml-2 rounded bg-gray-200 px-2 py-1"
        data-testid="video-uploader-cancel"
        @click="cancel"
      >
        Cancel
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
/* global Event, HTMLInputElement */
import { ref } from 'vue';
import { Upload } from 'tus-js-client';
import { apiFetch } from '../../lib/api.js';

const props = defineProps<{ postId: string }>();
const emit = defineEmits<{
  (e: 'upload-started', cfUid: string): void;
  (e: 'upload-success' | 'upload-cancelled'): void;
}>();

const error = ref<string | null>(null);
const uploading = ref(false);
const progress = ref(0);

// Local opaque ref for the active tus.Upload instance (typed as the minimal
// shape we need rather than the full library type, to keep the surface narrow
// and the mock simple).
interface AbortableUpload {
  start: () => void;
  abort: () => void;
}
let currentUpload: AbortableUpload | null = null;

const MAX_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB
const ACCEPTED_MIME = ['video/mp4', 'video/webm', 'video/quicktime'];

interface UploadUrlResponse {
  uploadUrl: string;
  cfUid: string;
}

interface ErrorResponseBody {
  error?: string;
}

async function onFileChange(ev: Event): Promise<void> {
  error.value = null;
  const file = (ev.target as HTMLInputElement).files?.[0];
  if (!file) return;

  // Client-side guards run BEFORE we contact the server. The server enforces
  // its own checks (spec §6); these merely save a round-trip and surface a
  // friendlier message inline.
  if (!ACCEPTED_MIME.includes(file.type)) {
    error.value = `Unsupported file type "${file.type}" — not a video.`;
    return;
  }
  if (file.size > MAX_BYTES) {
    error.value = `File too large (${file.size} bytes); max is 10 GB.`;
    return;
  }

  const res = await apiFetch(`/api/posts/${props.postId}/video/upload-url`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name, fileSizeBytes: file.size }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as ErrorResponseBody;
    error.value = body.error ?? 'upload-url request failed';
    return;
  }

  const { uploadUrl, cfUid } = (await res.json()) as UploadUrlResponse;
  emit('upload-started', cfUid);
  uploading.value = true;
  progress.value = 0;

  currentUpload = new Upload(file, {
    uploadUrl,
    retryDelays: [0, 1000, 3000, 5000],
    metadata: { filename: file.name, filetype: file.type },
    onProgress: (sent: number, total: number) => {
      progress.value = Math.round((sent / total) * 100);
    },
    onSuccess: () => {
      uploading.value = false;
      emit('upload-success');
    },
    onError: (err: Error) => {
      uploading.value = false;
      error.value = err.message;
    },
  }) as unknown as AbortableUpload;
  currentUpload.start();
}

async function cancel(): Promise<void> {
  if (currentUpload) {
    currentUpload.abort();
    currentUpload = null;
  }
  uploading.value = false;
  await apiFetch(`/api/posts/${props.postId}/video`, { method: 'DELETE' });
  emit('upload-cancelled');
}
</script>
