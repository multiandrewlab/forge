<template>
  <div class="video-editor space-y-4">
    <!--
      Status badge — surfaces the current pipeline status (uploading, processing,
      captions, suggesting, ready, failed, pending_cancel, or the synthetic
      "replacing" state when pendingCfUid is set on a ready post). Driven by
      useVideoStatus, so it reacts to WS frames inline.
    -->
    <VideoStatusBadge
      v-if="badgeStatus"
      :status="badgeStatus"
      :progress="progress"
      :pending-cf-uid="pendingCfUid"
      :last-error="lastError"
    />

    <!--
      Inline VideoUploader path: shown when the post has no upload yet (status
      null), OR after the user clicks Re-upload / Replace. The component
      handles the tus upload + DELETE-on-cancel itself; we just embed it.
    -->
    <VideoUploader
      v-if="showUploader"
      :post-id="postId"
      @upload-started="onUploadStarted"
      @upload-success="onUploadSuccess"
      @upload-cancelled="onUploadCancelled"
    />

    <!--
      Player — only rendered when CF has produced a playable asset. While the
      pipeline is mid-replace (status=ready + pendingCfUid set), the player
      still renders the CURRENT cfUid; the badge surfaces the replacement.
    -->
    <VideoPlayer v-if="badgeStatus === 'ready'" :post-id="postId" />

    <!--
      Failure banner: when the pipeline reports a known failure mode, surface
      its body copy from failure-mode-copy. Drives the CTA buttons below via
      the same `ctaKey` (single source of truth — no duplicate enum).
    -->
    <div
      v-if="failureCopy"
      data-testid="video-editor-failure-body"
      class="rounded bg-red-50 px-3 py-2 text-sm text-red-900"
    >
      {{ failureCopy.body }}
    </div>

    <!--
      AI suggestion form — title / description / tags. The user can edit these
      before publishing. Rendered as `<input>` / `<textarea>` so the AI text
      goes through Vue's `:value` (textContent) binding — NEVER `v-html`.
      Spec §9.4 safety gate.
    -->
    <form class="space-y-3" data-testid="video-editor-form" @submit.prevent>
      <label class="block text-sm">
        <span class="block text-gray-700">Title</span>
        <input
          v-model="formTitle"
          data-testid="video-editor-title"
          class="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          type="text"
        />
      </label>

      <label class="block text-sm">
        <span class="block text-gray-700">Description</span>
        <textarea
          v-model="formDescription"
          data-testid="video-editor-description"
          rows="4"
          class="mt-1 w-full rounded border border-gray-300 px-2 py-1"
        />
      </label>

      <div class="block text-sm">
        <span class="block text-gray-700">Tags</span>
        <ul class="mt-1 flex flex-wrap gap-1" data-testid="video-editor-tag-list">
          <li
            v-for="tag in formTags"
            :key="tag"
            class="flex items-center gap-1 rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-800"
          >
            <span>{{ tag }}</span>
            <button
              type="button"
              :data-testid="`video-editor-tag-remove-${tag}`"
              class="ml-1 text-gray-500 hover:text-gray-800"
              @click="removeTag(tag)"
            >
              ×
            </button>
          </li>
        </ul>
        <input
          v-model="tagInput"
          data-testid="video-editor-tag-input"
          class="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          type="text"
          placeholder="Type a tag and press Enter"
          @keydown.enter.prevent="addTag"
        />
      </div>
    </form>

    <!--
      Action buttons. Picked by ctaKey for failure modes; on ready posts both
      Replace (CTA) and Cancel are shown so the author can either swap the
      asset or delete it before publishing.
    -->
    <div class="flex flex-wrap gap-2">
      <button
        v-if="showRetryAiBtn"
        type="button"
        data-testid="video-editor-retry-ai-btn"
        class="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
        @click="onRetryAi"
      >
        {{ FAILURE_MODE_CTAS.retryAi.label }}
      </button>

      <button
        v-if="showReUploadBtn"
        type="button"
        data-testid="video-editor-reupload-btn"
        class="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
        @click="onReUpload"
      >
        {{ FAILURE_MODE_CTAS.reUpload.label }}
      </button>

      <button
        v-if="showReplaceBtn"
        type="button"
        data-testid="video-editor-replace-btn"
        class="rounded bg-blue-600 px-3 py-1 text-sm text-white hover:bg-blue-700"
        @click="onReplace"
      >
        {{ FAILURE_MODE_CTAS.replace.label }}
      </button>

      <button
        v-if="showCancelBtn"
        type="button"
        data-testid="video-editor-cancel-btn"
        class="rounded border border-red-500 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
        @click="onCancel"
      >
        Cancel
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import type { VideoStatus } from '@forge/shared';
import VideoStatusBadge from '../post/VideoStatusBadge.vue';
import VideoPlayer from '../post/VideoPlayer.vue';
import VideoUploader from './VideoUploader.vue';
import { useVideoStatus, type VideoSuggestion } from '../../composables/useVideoStatus.js';
import { failureModeCopy, FAILURE_MODE_CTAS } from '../../lib/failure-mode-copy.js';
import { apiFetch } from '../../lib/api.js';

const props = defineProps<{
  postId: string;
  // isAuthor is accepted for prop completeness even though VideoEditor is only
  // mounted for authors today; the page chrome decides whether to mount us.
  isAuthor: boolean;
}>();

const { status, progress, suggestions, error, pendingCfUid } = useVideoStatus(props.postId);

// Local form state — initialised from the GET /suggestions one-shot or from
// WS frames. Kept separate from the source refs so user edits aren't clobbered
// by a stale suggestion frame arriving after the user has typed.
const formTitle = ref('');
const formDescription = ref('');
const formTags = ref<string[]>([]);
const tagInput = ref('');

// Track the last applied runId so we only hydrate the form when a NEW
// suggestion arrives (different runId), not when the user is mid-edit and a
// duplicate frame replays.
const appliedRunId = ref<string | null>(null);

// Replace-mode flag — when the user clicks Re-upload or Replace, reveal the
// inline VideoUploader so they can pick a new file. Reset when the upload
// succeeds or is cancelled.
const replaceMode = ref(false);

interface SuggestionFetchResponse {
  status: string;
  lastError: string | null;
  suggestion: {
    id: string;
    title: string;
    description: string;
    tags: string[];
    createdAt: string;
  } | null;
}

function applySuggestion(s: {
  runId: string;
  title: string;
  description: string;
  tags: string[];
}): void {
  formTitle.value = s.title;
  formDescription.value = s.description;
  formTags.value = [...s.tags];
  appliedRunId.value = s.runId;
}

onMounted(async () => {
  // One-shot read of the current AI suggestion (if any). 404 is the "no
  // suggestion yet" path — leaves the form blank. The server response shape
  // is { status, lastError, suggestion: <row|null> } — unwrap before applying.
  const res = await apiFetch(`/api/posts/${props.postId}/video/suggestions`);
  if (!res.ok) return;
  const data = (await res.json()) as SuggestionFetchResponse;
  if (!data.suggestion) return;
  applySuggestion({ runId: data.suggestion.id, ...data.suggestion });
});

// React to live WS frames — only apply when the runId is new, so a stale
// replay or duplicate frame doesn't overwrite user edits.
watch(suggestions, (next: VideoSuggestion | null) => {
  if (!next) return;
  if (next.runId === appliedRunId.value) return;
  applySuggestion(next);
});

// ── Derived UI state ──────────────────────────────────────────────────

// status from useVideoStatus is VideoStatus | null. When null (no upload yet),
// we don't render the badge — the uploader is shown instead.
const badgeStatus = computed<VideoStatus | null>(() => status.value);
const lastError = computed(() => error.value);

// failure-mode-copy lookup: VideoStatusBadge already does this for its own
// label, but VideoEditor needs the full entry (body + ctaKey) for the inline
// banner and the CTA buttons. Same key-normalisation as VideoStatusBadge.
const failureCopy = computed(() => {
  if (status.value !== 'failed' || !error.value) return null;
  const key = error.value.toLowerCase().replace(/\s/g, '_');
  return failureModeCopy[key] ?? null;
});

const showRetryAiBtn = computed(() => failureCopy.value?.ctaKey === 'retryAi');
const showReUploadBtn = computed(() => failureCopy.value?.ctaKey === 'reUpload');
// Replace is offered (a) when the user is on a ready post (swap path), or
// (b) when a failure maps to the `replace` CTA.
const showReplaceBtn = computed(
  () => status.value === 'ready' || failureCopy.value?.ctaKey === 'replace',
);
// Cancel offered while the asset is in-flight (draft path). Hidden on ready
// because the published-path uses the standard post Delete flow.
const showCancelBtn = computed(() => status.value != null && status.value !== 'ready');

// VideoUploader is rendered (a) before any upload (status null), or (b)
// when the user has clicked Re-upload / Replace.
const showUploader = computed(() => status.value === null || replaceMode.value);

// ── Action handlers ───────────────────────────────────────────────────

async function onRetryAi(): Promise<void> {
  await apiFetch(`/api/posts/${props.postId}/video/ai-rerun`, { method: 'POST' });
}

function onReUpload(): void {
  replaceMode.value = true;
}

function onReplace(): void {
  replaceMode.value = true;
}

async function onCancel(): Promise<void> {
  await apiFetch(`/api/posts/${props.postId}/video`, { method: 'DELETE' });
}

function onUploadStarted(): void {
  // Keep the uploader visible until success/cancel; the badge reacts via the
  // WS frame for the new cfUid.
}

function onUploadSuccess(): void {
  replaceMode.value = false;
}

function onUploadCancelled(): void {
  replaceMode.value = false;
}

// ── Tag editor ────────────────────────────────────────────────────────

function addTag(): void {
  const v = tagInput.value.trim();
  if (!v) return;
  if (formTags.value.includes(v)) return;
  formTags.value.push(v);
  tagInput.value = '';
}

function removeTag(tag: string): void {
  formTags.value = formTags.value.filter((t) => t !== tag);
}
</script>
