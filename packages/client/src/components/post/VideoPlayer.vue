<template>
  <div class="video-player">
    <div
      v-if="refreshFailing"
      data-testid="video-player-refresh-toast"
      class="mb-2 rounded bg-yellow-50 px-3 py-2 text-sm text-yellow-900"
    >
      Refreshing playback session…
    </div>
    <div v-if="loading" data-testid="video-player-loading" class="text-sm text-gray-500">
      Loading video…
    </div>
    <div v-else-if="loadError" data-testid="video-player-error" class="text-sm text-red-700">
      Could not load video.
    </div>
    <!-- v-else branch is only reached after initialLoad sets playbackUrl. -->
    <video
      v-else
      :src="playbackSrc"
      controls
      data-testid="video-player-element"
      class="w-full rounded"
    />
  </div>
</template>

<script setup lang="ts">
/* global setTimeout, clearTimeout */
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { apiFetch } from '../../lib/api.js';

const props = defineProps<{ postId: string }>();

// CF Stream playback URL — refreshed before the 1-hour expiry. On refresh
// failure, an inline toast appears and retries fire with exponential backoff
// (1s, 2s, 4s, 8s, 16s, capped at 30s).
const playbackUrl = ref<string | null>(null);
const loading = ref(true);
const loadError = ref(false);
const refreshFailing = ref(false);

// playbackSrc narrows playbackUrl to string for the template. The v-else
// branch only renders after initialLoad sets playbackUrl, so this cast is
// safe.
const playbackSrc = computed(() => playbackUrl.value as string);

// CF Stream signs playback URLs for 1 hour; refresh 5 min before expiry.
const REFRESH_LEAD_MS = 55 * 60_000;
const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000];

let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retryIndex = 0;

function clearTimers(): void {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  if (retryTimer !== null) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

interface PlaybackResponse {
  playbackUrl: string;
}

async function fetchPlayback(): Promise<boolean> {
  const res = await apiFetch(`/api/posts/${props.postId}/video/playback`);
  if (!res.ok) return false;
  const data = (await res.json()) as PlaybackResponse;
  playbackUrl.value = data.playbackUrl;
  return true;
}

function scheduleRefresh(): void {
  // Caller guarantees refreshTimer is null at this point (either fresh mount
  // or just-fired callback). No need to defensively clear.
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void runRefresh();
  }, REFRESH_LEAD_MS);
}

const RETRY_CAP_MS = 30_000;

function scheduleRetry(): void {
  // RETRY_DELAYS_MS is bounded; once retryIndex exceeds the array length we
  // stay at the cap (30s). Using a single fallback constant keeps the v8
  // branch count to one decision (clamp vs no-clamp), tested by the
  // cap-at-30s assertion in VideoPlayer.test.ts.
  const delay = RETRY_DELAYS_MS[retryIndex] ?? RETRY_CAP_MS;
  retryIndex += 1;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    void runRefresh();
  }, delay);
}

async function runRefresh(): Promise<void> {
  const ok = await fetchPlayback();
  if (ok) {
    refreshFailing.value = false;
    retryIndex = 0;
    scheduleRefresh();
  } else {
    refreshFailing.value = true;
    scheduleRetry();
  }
}

async function initialLoad(): Promise<void> {
  loading.value = true;
  const ok = await fetchPlayback();
  loading.value = false;
  if (!ok) {
    loadError.value = true;
    return;
  }
  scheduleRefresh();
}

onMounted(() => {
  void initialLoad();
});

onUnmounted(() => {
  clearTimers();
});
</script>
