import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { apiFetch } from '../../lib/api.js';
import { useFeedStore } from '../../stores/feed.js';
import { useFeed } from '../../composables/useFeed.js';
import type { PostWithAuthor } from '@forge/shared';

vi.mock('../../lib/api.js', () => ({ apiFetch: vi.fn() }));
const mockApiFetch = apiFetch as Mock;

const mockSubscribe = vi.fn();
vi.mock('../../composables/useWebSocket.js', () => ({
  useWebSocket: () => ({
    subscribe: mockSubscribe,
    send: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    clientId: 'test-client-id',
    status: { value: 'idle' },
  }),
}));

const mockPost: PostWithAuthor = {
  id: '1',
  authorId: 'u1',
  title: 'Test',
  contentType: 'snippet',
  language: 'ts',
  visibility: 'public',
  isDraft: false,
  forkedFromId: null,
  linkUrl: null,
  linkPreview: null,
  voteCount: 5,
  viewCount: 10,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: 'u1', displayName: 'Test', avatarUrl: null },
  tags: [],
};

function mockFetchResponse(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
  } as Response;
}

describe('useFeed', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
    mockSubscribe.mockReset();
  });

  it('loadPosts fetches and populates store', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse({ posts: [mockPost], cursor: null }));
    const { loadPosts, posts } = useFeed();
    await loadPosts();
    expect(posts.value).toHaveLength(1);
    expect(posts.value[0].id).toBe('1');
  });

  it('loadPosts builds correct query string', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse({ posts: [], cursor: null }));
    const { loadPosts } = useFeed();
    await loadPosts();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts?sort=recent&limit=20');
  });

  it('loadMore appends posts using cursor', async () => {
    mockApiFetch.mockResolvedValueOnce(mockFetchResponse({ posts: [mockPost], cursor: 'abc' }));
    const { loadPosts, loadMore, posts } = useFeed();
    await loadPosts();

    const post2 = { ...mockPost, id: '2' };
    mockApiFetch.mockResolvedValueOnce(mockFetchResponse({ posts: [post2], cursor: null }));
    await loadMore();
    expect(posts.value).toHaveLength(2);
  });

  it('loadMore is a no-op when cursor is null', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse({ posts: [mockPost], cursor: null }));
    const { loadPosts, loadMore } = useFeed();
    await loadPosts();
    mockApiFetch.mockClear();

    await loadMore();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('setSort clears posts and reloads', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse({ posts: [mockPost], cursor: null }));
    const { loadPosts, setSort } = useFeed();
    await loadPosts();

    mockApiFetch.mockResolvedValue(mockFetchResponse({ posts: [], cursor: null }));
    await setSort('trending');
    expect(mockApiFetch).toHaveBeenLastCalledWith('/api/posts?sort=trending&limit=20');
  });

  it('setFilter clears posts and reloads', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse({ posts: [], cursor: null }));
    const { setFilter } = useFeed();
    await setFilter('mine');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts?sort=recent&filter=mine&limit=20');
  });

  it('error ref is set on fetch failure', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse({ error: 'Server error' }, false));
    const { loadPosts, error } = useFeed();
    await loadPosts();
    expect(error.value).toBeTruthy();
  });

  it('error ref is cleared on next load', async () => {
    mockApiFetch.mockResolvedValueOnce(mockFetchResponse({ error: 'fail' }, false));
    const { loadPosts, error } = useFeed();
    await loadPosts();
    expect(error.value).toBeTruthy();

    mockApiFetch.mockResolvedValueOnce(mockFetchResponse({ posts: [], cursor: null }));
    await loadPosts();
    expect(error.value).toBeNull();
  });

  it('loading ref is true during fetch', async () => {
    let resolvePromise: (v: Response) => void;
    mockApiFetch.mockReturnValue(
      new Promise((r) => {
        resolvePromise = r;
      }),
    );
    const { loadPosts, loading } = useFeed();
    const promise = loadPosts();
    expect(loading.value).toBe(true);
    (resolvePromise as (v: Response) => void)(mockFetchResponse({ posts: [], cursor: null }));
    await promise;
    expect(loading.value).toBe(false);
  });

  it('selectPost sets selectedPostId', () => {
    const { selectPost, selectedPost } = useFeed();
    selectPost('1');
    expect(selectedPost.value).toBeNull();
  });

  it('selectedPost returns matching post', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse({ posts: [mockPost], cursor: null }));
    const { loadPosts, selectPost, selectedPost } = useFeed();
    await loadPosts();
    selectPost('1');
    expect(selectedPost.value?.id).toBe('1');
  });

  it('setTag includes tag in query', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse({ posts: [], cursor: null }));
    const { setTag } = useFeed();
    await setTag('frontend');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts?sort=recent&tag=frontend&limit=20');
  });

  it('setContentType includes type in query', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse({ posts: [], cursor: null }));
    const { setContentType } = useFeed();
    await setContentType('snippet');
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts?sort=recent&type=snippet&limit=20');
  });

  it('loadMore sets error on non-ok response', async () => {
    // First load succeeds and sets cursor
    mockApiFetch.mockResolvedValueOnce(mockFetchResponse({ posts: [mockPost], cursor: 'abc' }));
    const { loadPosts, loadMore, error } = useFeed();
    await loadPosts();

    // loadMore returns error response
    mockApiFetch.mockResolvedValueOnce(mockFetchResponse({ error: 'Failed to load more' }, false));
    await loadMore();

    expect(error.value).toBeTruthy();
  });

  it('loadMore uses fallback error message when response has no error field', async () => {
    mockApiFetch.mockResolvedValueOnce(mockFetchResponse({ posts: [mockPost], cursor: 'abc' }));
    const { loadPosts, loadMore, error } = useFeed();
    await loadPosts();

    // Non-ok response with no error field
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response);
    await loadMore();

    expect(error.value).toBe('Failed to load more posts');
  });

  it('loadMore sets network error on exception', async () => {
    mockApiFetch.mockResolvedValueOnce(mockFetchResponse({ posts: [mockPost], cursor: 'abc' }));
    const { loadPosts, loadMore, error } = useFeed();
    await loadPosts();

    mockApiFetch.mockRejectedValueOnce(new Error('Network failure'));
    await loadMore();

    expect(error.value).toBe('Network error');
  });

  it('loadPosts uses fallback error when response json parse fails', async () => {
    mockApiFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error('parse fail')),
    } as unknown as Response);
    const { loadPosts, error } = useFeed();
    await loadPosts();

    expect(error.value).toBe('Failed to load posts');
  });

  describe('subscribeRealtime', () => {
    it('should subscribe to the feed channel', () => {
      const mockCleanup = vi.fn();
      mockSubscribe.mockReturnValue(mockCleanup);

      const { subscribeRealtime } = useFeed();
      const cleanup = subscribeRealtime();

      expect(mockSubscribe).toHaveBeenCalledWith('feed', expect.any(Function));
      expect(cleanup).toBe(mockCleanup);
    });

    it('should handle post:new by prepending to feed', () => {
      const store = useFeedStore();
      store.setPosts([mockPost]);

      const newPost: PostWithAuthor = { ...mockPost, id: 'new-1', title: 'New Post' };
      mockSubscribe.mockImplementation((_channel: string, handler: (event: unknown) => void) => {
        handler({ type: 'post:new', channel: 'feed', data: newPost });
        return vi.fn();
      });

      const { subscribeRealtime } = useFeed();
      subscribeRealtime();

      expect(store.posts).toHaveLength(2);
      expect(store.posts[0].id).toBe('new-1');
      expect(store.posts[1].id).toBe('1');
    });

    it('should handle post:updated by updating in place', () => {
      const store = useFeedStore();
      store.setPosts([mockPost]);

      const updatedPost: PostWithAuthor = { ...mockPost, title: 'Updated Title' };
      mockSubscribe.mockImplementation((_channel: string, handler: (event: unknown) => void) => {
        handler({ type: 'post:updated', channel: 'feed', data: updatedPost });
        return vi.fn();
      });

      const { subscribeRealtime } = useFeed();
      subscribeRealtime();

      expect(store.posts).toHaveLength(1);
      expect(store.posts[0].title).toBe('Updated Title');
    });

    it('should ignore post:updated for posts not in feed', () => {
      const store = useFeedStore();
      store.setPosts([mockPost]);

      const unknownPost: PostWithAuthor = { ...mockPost, id: 'unknown-1', title: 'Unknown' };
      mockSubscribe.mockImplementation((_channel: string, handler: (event: unknown) => void) => {
        handler({ type: 'post:updated', channel: 'feed', data: unknownPost });
        return vi.fn();
      });

      const { subscribeRealtime } = useFeed();
      subscribeRealtime();

      // Feed should be unchanged
      expect(store.posts).toHaveLength(1);
      expect(store.posts[0].id).toBe('1');
    });

    it('should ignore non-feed event types', () => {
      const store = useFeedStore();
      store.setPosts([mockPost]);

      mockSubscribe.mockImplementation((_channel: string, handler: (event: unknown) => void) => {
        handler({ type: 'vote:updated', channel: 'feed', data: { voteCount: 99 } });
        return vi.fn();
      });

      const { subscribeRealtime } = useFeed();
      subscribeRealtime();

      // Feed should be unchanged
      expect(store.posts).toHaveLength(1);
      expect(store.posts[0].title).toBe('Test');
    });
  });
});
