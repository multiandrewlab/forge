import { ref } from 'vue';
import { apiFetch } from '../lib/api.js';
import { useFeedStore } from '../stores/feed.js';
import type { BookmarkToggleResponse } from '@forge/shared';

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function useBookmarks() {
  const store = useFeedStore();
  const error = ref<string | null>(null);
  const loading = ref(false);

  async function toggleBookmark(postId: string): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/posts/${postId}/bookmark`, {
        method: 'POST',
      });

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to toggle bookmark');
        return;
      }

      const data = (await response.json()) as BookmarkToggleResponse;
      store.setBookmark(postId, data.bookmarked);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to toggle bookmark';
    } finally {
      loading.value = false;
    }
  }

  return {
    error,
    loading,
    toggleBookmark,
  };
}
