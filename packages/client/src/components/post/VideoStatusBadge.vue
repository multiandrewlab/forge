<template>
  <span
    class="inline-flex items-center gap-2 rounded px-2 py-1 text-sm"
    :class="badgeClass"
    :data-testid="`video-status-badge-${effectiveStatus}`"
  >
    <span>{{ label }}</span>
    <span v-if="status === 'uploading' && progress != null">{{ progress }}%</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { VideoStatus } from '@forge/shared';
import { failureModeCopy } from '../../lib/failure-mode-copy.js';

const props = defineProps<{
  status: VideoStatus;
  progress?: number | null;
  pendingCfUid?: string | null;
  lastError?: string | null;
}>();

// `replacing` is a synthetic UI state: status=ready + pendingCfUid means the
// user is mid-replace. Promote it to a distinct effectiveStatus so the
// data-testid + label both reflect it without leaking the implementation
// detail of pendingCfUid into every consumer.
const effectiveStatus = computed(() =>
  props.status === 'ready' && props.pendingCfUid ? 'replacing' : props.status,
);

// STATIC_LABELS keys are exhaustive over VideoStatus | 'replacing' — the only
// values `effectiveStatus.value` can produce. The Record type ensures TS
// rejects a future VideoStatus addition that lacks a label here, so no
// runtime ?? fallback is needed.
const STATIC_LABELS: Record<VideoStatus | 'replacing', string> = {
  uploading: 'Uploading',
  processing: 'Processing',
  captions: 'Generating captions',
  suggesting: 'Generating suggestions',
  ready: 'Ready',
  failed: 'Failed',
  pending_cancel: 'Cancelling',
  replacing: 'Replacing',
};

const label = computed(() => {
  if (props.status === 'failed' && props.lastError) {
    const key = props.lastError.toLowerCase().replace(/\s/g, '_');
    const copy = failureModeCopy[key];
    return copy ? copy.headline : `Failed: ${props.lastError}`;
  }
  return STATIC_LABELS[effectiveStatus.value];
});

// Tailwind color palette convention: red for terminal failure, green for the
// happy "ready" state, blue for every transient in-flight state (including
// `replacing`, which is a transient on top of ready).
const badgeClass = computed(() => {
  if (props.status === 'failed') return 'bg-red-100 text-red-800';
  if (props.status === 'ready' && !props.pendingCfUid) return 'bg-green-100 text-green-800';
  return 'bg-blue-100 text-blue-800';
});
</script>
