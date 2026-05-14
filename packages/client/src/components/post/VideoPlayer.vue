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
    <!--
      v-else branch is only reached after initialLoad sets playbackUrl. The
      <video> src is attached imperatively via attachPlayback() so we can use
      hls.js on Chrome/Firefox (HLS via MediaSource Extensions) while still
      letting Safari use its native HLS support.
    -->
    <video
      v-else
      ref="videoRef"
      controls
      data-testid="video-player-element"
      class="w-full rounded"
    />
  </div>
</template>

<script setup lang="ts">
/* global setTimeout, clearTimeout, HTMLVideoElement */
import { ref, onMounted, onUnmounted, nextTick } from 'vue';
import Hls from 'hls.js';
import { apiFetch } from '../../lib/api.js';

const props = defineProps<{ postId: string }>();

// CF Stream playback URL — refreshed before the 1-hour expiry. On refresh
// failure, an inline toast appears and retries fire with exponential backoff
// (1s, 2s, 4s, 8s, 16s, capped at 30s).
const playbackUrl = ref<string | null>(null);
const loading = ref(true);
const loadError = ref(false);
const refreshFailing = ref(false);

const videoRef = ref<HTMLVideoElement | null>(null);
let hls: Hls | null = null;

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

function destroyHls(): void {
  if (hls !== null) {
    hls.destroy();
    hls = null;
  }
}

/**
 * Attach the current playback URL to the <video> element using the right
 * mechanism for the browser:
 *
 *  - Safari natively plays HLS — set video.src directly.
 *  - Chrome/Firefox/Edge need MediaSource Extensions — use hls.js.
 *  - As a last resort (neither native HLS nor MSE), set video.src and let
 *    the browser fail; the existing initial-load error path covers the UX.
 *
 * Called on initial fetch, on every 55-min refresh, and on each retry.
 */
function attachPlayback(): void {
  const video = videoRef.value;
  // attachPlayback is only called from initialLoad/runRefresh AFTER a
  // successful fetchPlayback (`playbackUrl` is always non-null at this
  // point). `videoRef` is set by the v-else branch which is rendered after
  // `loading.value = false`; the nextTick() in initialLoad covers that.
  // The null guard below is defensive against a future refactor that calls
  // attachPlayback before the v-else has mounted (e.g. mid-unmount race).
  /* v8 ignore next */
  if (video === null) return;
  const url = playbackUrl.value as string;

  // Safari: native HLS support.
  if (video.canPlayType('application/vnd.apple.mpegurl') !== '') {
    destroyHls();
    video.src = url;
    return;
  }

  // Chrome / Firefox / Edge: hls.js via MediaSource Extensions.
  if (Hls.isSupported()) {
    destroyHls();
    hls = new Hls();
    hls.loadSource(url);
    hls.attachMedia(video);
    return;
  }

  // Fallback — no native HLS, no MSE. Likely fails, but try anyway so the
  // user sees the browser's own error UI rather than a silent blank player.
  video.src = url;
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
    // Re-attach the (possibly identical) URL — the playbackUrl watcher won't
    // fire on a same-value set, but we still need to mint a new hls.js
    // session so the new signed manifest URL is fetched. Without this call
    // the player would keep using the old URL until the CF signature
    // expired and playback stalled.
    attachPlayback();
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
  // After flipping `loading` to false, the v-else branch is rendered on the
  // next tick. Wait for the <video> element to exist, then attach. The
  // playbackUrl watcher would also fire eventually but races with the v-if
  // transition; doing it explicitly here is deterministic.
  await nextTick();
  attachPlayback();
  scheduleRefresh();
}

onMounted(() => {
  void initialLoad();
});

onUnmounted(() => {
  clearTimers();
  destroyHls();
});
</script>
