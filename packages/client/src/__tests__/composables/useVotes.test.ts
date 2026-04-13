import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useFeedStore } from '../../stores/feed.js';
import type { PostWithAuthor, VoteResponse } from '@forge/shared';

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

function mockResponse(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
  } as Response;
}

const mockApiFetch = vi.fn();
vi.mock('../../lib/api.js', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args) as unknown,
}));

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

import { useVotes } from '../../composables/useVotes.js';

describe('useVotes', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
    mockSubscribe.mockReset();
  });

  describe('vote', () => {
    it('should POST to /api/posts/:id/vote with value and update store', async () => {
      const store = useFeedStore();
      store.setPosts([mockPost]);

      const voteResponse: VoteResponse = { voteCount: 6, userVote: 1 };
      mockApiFetch.mockResolvedValue(mockResponse(voteResponse));

      const { vote } = useVotes();
      await vote('1', 1);

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/1/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value: 1 }),
      });
      expect(store.userVotes['1']).toBe(1);
      expect(store.posts[0].voteCount).toBe(6);
    });

    it('should set error on non-ok response', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({ error: 'Unauthorized' }, false));

      const { vote, error } = useVotes();
      await vote('1', 1);

      expect(error.value).toBe('Unauthorized');
    });

    it('should use fallback error when response has no error field', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({}, false));

      const { vote, error } = useVotes();
      await vote('1', 1);

      expect(error.value).toBe('Failed to vote');
    });

    it('should use fallback error when response json parse fails', async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('parse fail')),
      } as unknown as Response);

      const { vote, error } = useVotes();
      await vote('1', 1);

      expect(error.value).toBe('Failed to vote');
    });

    it('should set error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { vote, error } = useVotes();
      await vote('1', 1);

      expect(error.value).toBe('Network error');
    });

    it('should use fallback error for non-Error thrown values', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { vote, error } = useVotes();
      await vote('1', 1);

      expect(error.value).toBe('Failed to vote');
    });

    it('should set loading during request', async () => {
      let resolvePromise: (v: Response) => void;
      mockApiFetch.mockReturnValue(
        new Promise((r) => {
          resolvePromise = r;
        }),
      );

      const { vote, loading } = useVotes();
      const promise = vote('1', 1);
      expect(loading.value).toBe(true);

      const voteResponse: VoteResponse = { voteCount: 6, userVote: 1 };
      (resolvePromise as (v: Response) => void)(mockResponse(voteResponse));
      await promise;
      expect(loading.value).toBe(false);
    });

    it('should clear previous error on new call', async () => {
      mockApiFetch.mockResolvedValueOnce(mockResponse({ error: 'fail' }, false));

      const { vote, error } = useVotes();
      await vote('1', 1);
      expect(error.value).toBeTruthy();

      const voteResponse: VoteResponse = { voteCount: 6, userVote: 1 };
      mockApiFetch.mockResolvedValueOnce(mockResponse(voteResponse));
      await vote('1', 1);
      expect(error.value).toBeNull();
    });
  });

  describe('removeVote', () => {
    it('should DELETE /api/posts/:id/vote and update store', async () => {
      const store = useFeedStore();
      store.setPosts([mockPost]);
      store.updatePostVote('1', 6, 1);

      const voteResponse: VoteResponse = { voteCount: 5, userVote: null };
      mockApiFetch.mockResolvedValue(mockResponse(voteResponse));

      const { removeVote } = useVotes();
      await removeVote('1');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/1/vote', {
        method: 'DELETE',
      });
      expect(store.userVotes['1']).toBeUndefined();
      expect(store.posts[0].voteCount).toBe(5);
    });

    it('should set error on non-ok response', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({ error: 'Not found' }, false));

      const { removeVote, error } = useVotes();
      await removeVote('1');

      expect(error.value).toBe('Not found');
    });

    it('should use fallback error when response has no error field', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({}, false));

      const { removeVote, error } = useVotes();
      await removeVote('1');

      expect(error.value).toBe('Failed to remove vote');
    });

    it('should use fallback error when response json parse fails', async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('parse fail')),
      } as unknown as Response);

      const { removeVote, error } = useVotes();
      await removeVote('1');

      expect(error.value).toBe('Failed to remove vote');
    });

    it('should set error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { removeVote, error } = useVotes();
      await removeVote('1');

      expect(error.value).toBe('Network error');
    });

    it('should use fallback error for non-Error thrown values', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { removeVote, error } = useVotes();
      await removeVote('1');

      expect(error.value).toBe('Failed to remove vote');
    });

    it('should set loading during request', async () => {
      let resolvePromise: (v: Response) => void;
      mockApiFetch.mockReturnValue(
        new Promise((r) => {
          resolvePromise = r;
        }),
      );

      const { removeVote, loading } = useVotes();
      const promise = removeVote('1');
      expect(loading.value).toBe(true);

      const voteResponse: VoteResponse = { voteCount: 5, userVote: null };
      (resolvePromise as (v: Response) => void)(mockResponse(voteResponse));
      await promise;
      expect(loading.value).toBe(false);
    });

    it('should clear previous error on new call', async () => {
      mockApiFetch.mockResolvedValueOnce(mockResponse({ error: 'fail' }, false));

      const { removeVote, error } = useVotes();
      await removeVote('1');
      expect(error.value).toBeTruthy();

      const voteResponse: VoteResponse = { voteCount: 5, userVote: null };
      mockApiFetch.mockResolvedValueOnce(mockResponse(voteResponse));
      await removeVote('1');
      expect(error.value).toBeNull();
    });
  });

  describe('subscribeRealtime', () => {
    it('should subscribe to the post channel', () => {
      const mockCleanup = vi.fn();
      mockSubscribe.mockReturnValue(mockCleanup);

      const { subscribeRealtime } = useVotes();
      const cleanup = subscribeRealtime('1');

      expect(mockSubscribe).toHaveBeenCalledWith('post:1', expect.any(Function));
      expect(cleanup).toBe(mockCleanup);
    });

    it('should handle vote:updated by updating voteCount without touching userVote', () => {
      const store = useFeedStore();
      store.setPosts([mockPost]);
      // Set a user vote first — it should remain untouched
      store.updatePostVote('1', 5, 1);

      mockSubscribe.mockImplementation((_channel: string, handler: (event: unknown) => void) => {
        handler({ type: 'vote:updated', channel: 'post:1', data: { voteCount: 42 } });
        return vi.fn();
      });

      const { subscribeRealtime } = useVotes();
      subscribeRealtime('1');

      expect(store.posts[0].voteCount).toBe(42);
      // userVote should be preserved
      expect(store.userVotes['1']).toBe(1);
    });

    it('should ignore non-vote event types', () => {
      const store = useFeedStore();
      const freshPost = { ...mockPost, voteCount: 5 };
      store.setPosts([freshPost]);

      mockSubscribe.mockImplementation((_channel: string, handler: (event: unknown) => void) => {
        handler({ type: 'comment:new', channel: 'post:1', data: { id: 'c1' } });
        return vi.fn();
      });

      const { subscribeRealtime } = useVotes();
      subscribeRealtime('1');

      // voteCount should be unchanged
      expect(store.posts[0].voteCount).toBe(5);
    });
  });
});
