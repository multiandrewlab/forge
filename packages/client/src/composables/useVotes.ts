import { ref } from 'vue';
import { apiFetch } from '../lib/api.js';
import { useFeedStore } from '../stores/feed.js';
import { usePostsStore } from '../stores/posts.js';
import { useWebSocket } from './useWebSocket.js';
import type { VoteValue, VoteResponse, ServerMessage } from '@forge/shared';

/**
 * Mirror an updated voteCount onto usePostsStore.currentPost when the IDs
 * match. Without this, the post-view page (which reads from the posts store,
 * not the feed store) won't reactively reflect a vote that the user just
 * cast directly from the post view.
 */
function syncCurrentPostVoteCount(postId: string, voteCount: number): void {
  const postsStore = usePostsStore();
  const cp = postsStore.currentPost;
  if (cp && cp.id === postId) {
    cp.voteCount = voteCount;
  }
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function useVotes() {
  const store = useFeedStore();
  const error = ref<string | null>(null);
  const loading = ref(false);

  async function vote(postId: string, value: VoteValue): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/posts/${postId}/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to vote');
        return;
      }

      const data = (await response.json()) as VoteResponse;
      store.updatePostVote(postId, data.voteCount, data.userVote);
      syncCurrentPostVoteCount(postId, data.voteCount);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to vote';
    } finally {
      loading.value = false;
    }
  }

  async function removeVote(postId: string): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/posts/${postId}/vote`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to remove vote');
        return;
      }

      const data = (await response.json()) as VoteResponse;
      store.updatePostVote(postId, data.voteCount, data.userVote);
      syncCurrentPostVoteCount(postId, data.voteCount);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to remove vote';
    } finally {
      loading.value = false;
    }
  }

  function subscribeRealtime(postId: string): () => void {
    const { subscribe } = useWebSocket();

    return subscribe(`post:${postId}`, (event: ServerMessage) => {
      if (event.type === 'vote:updated') {
        // Only update the aggregate voteCount — the WS event doesn't carry
        // per-user vote info, so we must not overwrite userVote.
        const wsCount = (event.data as { voteCount: number }).voteCount;
        store.updateVoteCount(postId, wsCount);
        syncCurrentPostVoteCount(postId, wsCount);
      }
    });
  }

  return {
    error,
    loading,
    vote,
    removeVote,
    subscribeRealtime,
  };
}
