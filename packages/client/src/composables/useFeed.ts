import { ref, computed } from 'vue';
import { storeToRefs } from 'pinia';
import { apiFetch } from '../lib/api.js';
import { useFeedStore } from '../stores/feed.js';
import { useWebSocket } from './useWebSocket.js';
import type {
  FeedSort,
  FeedFilter,
  FeedContentType,
  FeedResponse,
  PostWithAuthor,
  ServerMessage,
} from '@forge/shared';

export function useFeed() {
  const store = useFeedStore();
  const { posts, sort, selectedPostId, cursor, tag, filter, contentType, hasMore } =
    storeToRefs(store);
  const error = ref<string | null>(null);
  const loading = ref(false);

  const selectedPost = computed(
    () => posts.value.find((p) => p.id === selectedPostId.value) ?? null,
  );

  function buildUrl(): string {
    const params = new URLSearchParams();
    params.set('sort', store.sort);
    if (store.filter) params.set('filter', store.filter);
    if (store.tag) params.set('tag', store.tag);
    if (store.contentType) params.set('type', store.contentType);
    params.set('limit', '20');
    return `/api/posts?${params.toString()}`;
  }

  async function loadPosts(): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(buildUrl());
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        error.value = data.error ?? 'Failed to load posts';
        return;
      }
      const data = (await response.json()) as FeedResponse;
      store.setPosts(data.posts);
      store.setCursor(data.cursor);
    } catch {
      error.value = 'Network error';
    } finally {
      loading.value = false;
    }
  }

  async function loadMore(): Promise<void> {
    if (!store.cursor) return;
    error.value = null;
    loading.value = true;
    try {
      const url = `${buildUrl()}&cursor=${encodeURIComponent(store.cursor)}`;
      const response = await apiFetch(url);
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as {
          error?: string;
        };
        error.value = data.error ?? 'Failed to load more posts';
        return;
      }
      const data = (await response.json()) as FeedResponse;
      store.appendPosts(data.posts);
      store.setCursor(data.cursor);
    } catch {
      error.value = 'Network error';
    } finally {
      loading.value = false;
    }
  }

  async function setSort(value: FeedSort): Promise<void> {
    store.setSort(value);
    store.setCursor(null);
    await loadPosts();
  }

  async function setFilter(value: FeedFilter | null): Promise<void> {
    store.setFilter(value);
    store.setCursor(null);
    await loadPosts();
  }

  async function setTag(value: string | null): Promise<void> {
    store.setTag(value);
    store.setCursor(null);
    await loadPosts();
  }

  async function setContentType(value: FeedContentType | null): Promise<void> {
    store.setContentType(value);
    store.setCursor(null);
    await loadPosts();
  }

  function selectPost(id: string | null): void {
    store.setSelectedPostId(id);
  }

  function subscribeRealtime(): () => void {
    const { subscribe } = useWebSocket();

    return subscribe('feed', (event: ServerMessage) => {
      switch (event.type) {
        case 'post:new':
          // Prepend new post to the feed list.
          // The store has `setPosts` and `appendPosts` but no `prependPost`,
          // so we construct the new array directly via setPosts.
          store.setPosts([event.data as PostWithAuthor, ...store.posts]);
          break;
        case 'post:updated': {
          // Update the post in-place if it exists in the current feed list.
          const updated = event.data as PostWithAuthor;
          const idx = store.posts.findIndex((p) => p.id === updated.id);
          if (idx !== -1) {
            const copy = [...store.posts];
            copy[idx] = updated;
            store.setPosts(copy);
          }
          break;
        }
        default:
          // Ignore non-feed events on this channel
          break;
      }
    });
  }

  return {
    posts,
    sort,
    selectedPostId,
    cursor,
    tag,
    filter,
    contentType,
    hasMore,
    selectedPost,
    error,
    loading,
    loadPosts,
    loadMore,
    setSort,
    setFilter,
    setTag,
    setContentType,
    selectPost,
    subscribeRealtime,
  };
}
