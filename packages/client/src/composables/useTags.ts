import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { apiFetch } from '../lib/api.js';
import { useTagsStore } from '../stores/tags.js';
import type { Tag } from '@forge/shared';

export function useTags() {
  const store = useTagsStore();
  const { subscribedTags, popularTags } = storeToRefs(store);
  const error = ref<string | null>(null);
  const loading = ref(false);

  async function loadSubscriptions(): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch('/api/tags/subscriptions');
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        error.value = data.error ?? 'Failed to load subscriptions';
        return;
      }
      const data = (await response.json()) as { tags: Tag[] };
      store.setSubscribedTags(data.tags);
    } catch {
      error.value = 'Network error';
    } finally {
      loading.value = false;
    }
  }

  async function loadPopularTags(limit: number): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/tags/popular?limit=${limit}`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        error.value = data.error ?? 'Failed to load popular tags';
        return;
      }
      const data = (await response.json()) as { tags: Tag[] };
      store.setPopularTags(data.tags);
    } catch {
      error.value = 'Network error';
    } finally {
      loading.value = false;
    }
  }

  async function searchTags(query: string, limit: number): Promise<Tag[]> {
    error.value = null;
    loading.value = true;
    try {
      const params = new URLSearchParams();
      params.set('q', query);
      params.set('limit', String(limit));
      const response = await apiFetch(`/api/tags?${params.toString()}`);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        error.value = data.error ?? 'Failed to search tags';
        loading.value = false;
        return [];
      }
      const data = (await response.json()) as { tags: Tag[] };
      loading.value = false;
      return data.tags;
    } catch {
      error.value = 'Network error';
      loading.value = false;
      return [];
    }
  }

  async function subscribe(tag: Tag): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/tags/${tag.id}/subscribe`, {
        method: 'POST',
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        error.value = data.error ?? 'Failed to subscribe';
        return;
      }
      store.addSubscription(tag);
    } catch {
      error.value = 'Network error';
    } finally {
      loading.value = false;
    }
  }

  async function unsubscribe(tagId: string): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/tags/${tagId}/subscribe`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        error.value = data.error ?? 'Failed to unsubscribe';
        return;
      }
      store.removeSubscription(tagId);
    } catch {
      error.value = 'Network error';
    } finally {
      loading.value = false;
    }
  }

  return {
    subscribedTags,
    popularTags,
    error,
    loading,
    loadSubscriptions,
    loadPopularTags,
    searchTags,
    subscribe,
    unsubscribe,
  };
}
