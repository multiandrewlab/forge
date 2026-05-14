import { ref, onMounted, onUnmounted, type Ref } from 'vue';
import type { ServerMessage, VideoStatus } from '@forge/shared';
import { useWebSocket } from './useWebSocket.js';

// Shape of the AI-suggestion-ready WS frame, mirrored from
// VideoAiSuggestionReadyEvent in @forge/shared but with the channel field that
// the server adds for routing.
export interface VideoSuggestion {
  runId: string;
  title: string;
  description: string;
  tags: string[];
  createdAt: string;
}

interface VideoStatusEventFrame {
  type: 'video:status';
  channel: string;
  postId: string;
  status: VideoStatus;
  lastError?: string;
  pendingCfUid?: string | null;
}

interface VideoAiSuggestionReadyFrame {
  type: 'video:ai-suggestion-ready';
  channel: string;
  postId: string;
  runId: string;
  title: string;
  description: string;
  tags: string[];
  createdAt: string;
}

export interface UseVideoStatusReturn {
  status: Ref<VideoStatus | null>;
  progress: Ref<number | null>;
  suggestions: Ref<VideoSuggestion | null>;
  error: Ref<string | null>;
  pendingCfUid: Ref<string | null>;
}

/**
 * Subscribe to the owner channel for a single video post.
 *
 * Channel: `post:<postId>:owner` — emitted server-side when CF Stream advances
 * an asset (status frames) and when the AI title/description extraction
 * completes. The composable is reactive — the returned refs update inline.
 *
 * Lifecycle: subscribes on mount, unsubscribes on unmount. Safe to instantiate
 * multiple times on the same postId; each call gets its own unsubscribe.
 */
export function useVideoStatus(postId: string): UseVideoStatusReturn {
  const status = ref<VideoStatus | null>(null);
  const progress = ref<number | null>(null);
  const suggestions = ref<VideoSuggestion | null>(null);
  const error = ref<string | null>(null);
  const pendingCfUid = ref<string | null>(null);

  const { subscribe } = useWebSocket();
  let unsubscribe: (() => void) | null = null;

  onMounted(() => {
    unsubscribe = subscribe(`post:${postId}:owner`, (msg: ServerMessage) => {
      // The ServerMessage union in @forge/shared does not yet enumerate video
      // events (they live in types/video.ts as VideoStatusEvent /
      // VideoAiSuggestionReadyEvent — separate types). Widen to a tagged
      // shape locally and narrow on `type`; the server is the source of
      // truth for the wire frame.
      const frame = msg as unknown as { type: string };
      if (frame.type === 'video:status') {
        const evt = frame as unknown as VideoStatusEventFrame;
        if (evt.postId !== postId) return;
        status.value = evt.status;
        error.value = evt.lastError ?? null;
        pendingCfUid.value = evt.pendingCfUid ?? null;
        return;
      }
      if (frame.type === 'video:ai-suggestion-ready') {
        const evt = frame as unknown as VideoAiSuggestionReadyFrame;
        if (evt.postId !== postId) return;
        suggestions.value = {
          runId: evt.runId,
          title: evt.title,
          description: evt.description,
          tags: evt.tags,
          createdAt: evt.createdAt,
        };
      }
    });
  });

  onUnmounted(() => {
    unsubscribe?.();
  });

  return { status, progress, suggestions, error, pendingCfUid };
}
