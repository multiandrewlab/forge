import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCommentsStore } from '../../stores/comments.js';
import type { Comment } from '@forge/shared';

const mockComment: Comment = {
  id: 'c1',
  postId: 'p1',
  author: { id: 'u1', displayName: 'Test User', avatarUrl: null },
  parentId: null,
  lineNumber: null,
  revisionId: null,
  revisionNumber: null,
  body: 'A comment',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const mockReplyComment: Comment = {
  id: 'c2',
  postId: 'p1',
  author: { id: 'u1', displayName: 'Test User', avatarUrl: null },
  parentId: 'c1',
  lineNumber: null,
  revisionId: 'rev1',
  revisionNumber: 1,
  body: 'A reply',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
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

import { useComments } from '../../composables/useComments.js';

describe('useComments', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
    mockSubscribe.mockReset();
  });

  describe('fetchComments', () => {
    it('should GET /api/posts/:id/comments and set store', async () => {
      const store = useCommentsStore();

      mockApiFetch.mockResolvedValue(mockResponse({ comments: [mockComment] }));

      const { fetchComments } = useComments();
      await fetchComments('p1');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/comments');
      expect(store.comments).toEqual([mockComment]);
    });

    it('should set error on non-ok response', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({ error: 'Unauthorized' }, false));

      const { fetchComments, error } = useComments();
      await fetchComments('p1');

      expect(error.value).toBe('Unauthorized');
    });

    it('should use fallback error when response has no error field', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({}, false));

      const { fetchComments, error } = useComments();
      await fetchComments('p1');

      expect(error.value).toBe('Failed to load comments');
    });

    it('should use fallback error when response json parse fails', async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('parse fail')),
      } as unknown as Response);

      const { fetchComments, error } = useComments();
      await fetchComments('p1');

      expect(error.value).toBe('Failed to load comments');
    });

    it('should set error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { fetchComments, error } = useComments();
      await fetchComments('p1');

      expect(error.value).toBe('Network error');
    });

    it('should use fallback error for non-Error thrown values', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { fetchComments, error } = useComments();
      await fetchComments('p1');

      expect(error.value).toBe('Failed to load comments');
    });

    it('should set loading during request', async () => {
      let resolvePromise: (v: Response) => void;
      mockApiFetch.mockReturnValue(
        new Promise((r) => {
          resolvePromise = r;
        }),
      );

      const { fetchComments, loading } = useComments();
      const promise = fetchComments('p1');
      expect(loading.value).toBe(true);

      (resolvePromise as (v: Response) => void)(mockResponse({ comments: [mockComment] }));
      await promise;
      expect(loading.value).toBe(false);
    });

    it('should clear previous error on new call', async () => {
      mockApiFetch.mockResolvedValueOnce(mockResponse({ error: 'fail' }, false));

      const { fetchComments, error } = useComments();
      await fetchComments('p1');
      expect(error.value).toBeTruthy();

      mockApiFetch.mockResolvedValueOnce(mockResponse({ comments: [mockComment] }));
      await fetchComments('p1');
      expect(error.value).toBeNull();
    });
  });

  describe('addComment', () => {
    it('should POST with body and add to store', async () => {
      const store = useCommentsStore();

      mockApiFetch.mockResolvedValue(mockResponse({ comment: mockComment }));

      const { addComment } = useComments();
      await addComment('p1', { body: 'A comment' });

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'A comment' }),
      });
      expect(store.comments).toEqual([mockComment]);
    });

    it('should POST with optional fields', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({ comment: mockReplyComment }));

      const { addComment } = useComments();
      await addComment('p1', {
        body: 'A reply',
        parentId: 'c1',
        lineNumber: 10,
        revisionId: 'rev1',
      });

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          body: 'A reply',
          parentId: 'c1',
          lineNumber: 10,
          revisionId: 'rev1',
        }),
      });
    });

    it('should set error on non-ok response', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({ error: 'Validation failed' }, false));

      const { addComment, error } = useComments();
      await addComment('p1', { body: 'test' });

      expect(error.value).toBe('Validation failed');
    });

    it('should use fallback error when response has no error field', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({}, false));

      const { addComment, error } = useComments();
      await addComment('p1', { body: 'test' });

      expect(error.value).toBe('Failed to add comment');
    });

    it('should use fallback error when response json parse fails', async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('parse fail')),
      } as unknown as Response);

      const { addComment, error } = useComments();
      await addComment('p1', { body: 'test' });

      expect(error.value).toBe('Failed to add comment');
    });

    it('should set error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { addComment, error } = useComments();
      await addComment('p1', { body: 'test' });

      expect(error.value).toBe('Network error');
    });

    it('should use fallback error for non-Error thrown values', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { addComment, error } = useComments();
      await addComment('p1', { body: 'test' });

      expect(error.value).toBe('Failed to add comment');
    });

    it('should set loading during request', async () => {
      let resolvePromise: (v: Response) => void;
      mockApiFetch.mockReturnValue(
        new Promise((r) => {
          resolvePromise = r;
        }),
      );

      const { addComment, loading } = useComments();
      const promise = addComment('p1', { body: 'test' });
      expect(loading.value).toBe(true);

      (resolvePromise as (v: Response) => void)(mockResponse({ comment: mockComment }));
      await promise;
      expect(loading.value).toBe(false);
    });

    it('should clear previous error on new call', async () => {
      mockApiFetch.mockResolvedValueOnce(mockResponse({ error: 'fail' }, false));

      const { addComment, error } = useComments();
      await addComment('p1', { body: 'test' });
      expect(error.value).toBeTruthy();

      mockApiFetch.mockResolvedValueOnce(mockResponse({ comment: mockComment }));
      await addComment('p1', { body: 'test' });
      expect(error.value).toBeNull();
    });
  });

  describe('editComment', () => {
    it('should PATCH and update store', async () => {
      const store = useCommentsStore();
      store.setComments([mockComment]);

      const updated: Comment = { ...mockComment, body: 'Updated body' };
      mockApiFetch.mockResolvedValue(mockResponse({ comment: updated }));

      const { editComment } = useComments();
      await editComment('p1', 'c1', 'Updated body');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/comments/c1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Updated body' }),
      });
      expect(store.comments[0].body).toBe('Updated body');
    });

    it('should set error on non-ok response', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({ error: 'Forbidden' }, false));

      const { editComment, error } = useComments();
      await editComment('p1', 'c1', 'Updated body');

      expect(error.value).toBe('Forbidden');
    });

    it('should use fallback error when response has no error field', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({}, false));

      const { editComment, error } = useComments();
      await editComment('p1', 'c1', 'Updated body');

      expect(error.value).toBe('Failed to edit comment');
    });

    it('should use fallback error when response json parse fails', async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('parse fail')),
      } as unknown as Response);

      const { editComment, error } = useComments();
      await editComment('p1', 'c1', 'Updated body');

      expect(error.value).toBe('Failed to edit comment');
    });

    it('should set error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { editComment, error } = useComments();
      await editComment('p1', 'c1', 'Updated body');

      expect(error.value).toBe('Network error');
    });

    it('should use fallback error for non-Error thrown values', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { editComment, error } = useComments();
      await editComment('p1', 'c1', 'Updated body');

      expect(error.value).toBe('Failed to edit comment');
    });

    it('should set loading during request', async () => {
      let resolvePromise: (v: Response) => void;
      mockApiFetch.mockReturnValue(
        new Promise((r) => {
          resolvePromise = r;
        }),
      );

      const { editComment, loading } = useComments();
      const promise = editComment('p1', 'c1', 'Updated body');
      expect(loading.value).toBe(true);

      const updated: Comment = { ...mockComment, body: 'Updated body' };
      (resolvePromise as (v: Response) => void)(mockResponse({ comment: updated }));
      await promise;
      expect(loading.value).toBe(false);
    });

    it('should clear previous error on new call', async () => {
      mockApiFetch.mockResolvedValueOnce(mockResponse({ error: 'fail' }, false));

      const { editComment, error } = useComments();
      await editComment('p1', 'c1', 'Updated body');
      expect(error.value).toBeTruthy();

      const updated: Comment = { ...mockComment, body: 'Updated body' };
      mockApiFetch.mockResolvedValueOnce(mockResponse({ comment: updated }));
      await editComment('p1', 'c1', 'Updated body');
      expect(error.value).toBeNull();
    });
  });

  describe('deleteComment', () => {
    it('should DELETE and remove from store', async () => {
      const store = useCommentsStore();
      store.setComments([mockComment]);

      mockApiFetch.mockResolvedValue(mockResponse({}));

      const { deleteComment } = useComments();
      await deleteComment('p1', 'c1');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/comments/c1', {
        method: 'DELETE',
      });
      expect(store.comments).toEqual([]);
    });

    it('should set error on non-ok response', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({ error: 'Not found' }, false));

      const { deleteComment, error } = useComments();
      await deleteComment('p1', 'c1');

      expect(error.value).toBe('Not found');
    });

    it('should use fallback error when response has no error field', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({}, false));

      const { deleteComment, error } = useComments();
      await deleteComment('p1', 'c1');

      expect(error.value).toBe('Failed to delete comment');
    });

    it('should use fallback error when response json parse fails', async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('parse fail')),
      } as unknown as Response);

      const { deleteComment, error } = useComments();
      await deleteComment('p1', 'c1');

      expect(error.value).toBe('Failed to delete comment');
    });

    it('should set error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { deleteComment, error } = useComments();
      await deleteComment('p1', 'c1');

      expect(error.value).toBe('Network error');
    });

    it('should use fallback error for non-Error thrown values', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { deleteComment, error } = useComments();
      await deleteComment('p1', 'c1');

      expect(error.value).toBe('Failed to delete comment');
    });

    it('should set loading during request', async () => {
      let resolvePromise: (v: Response) => void;
      mockApiFetch.mockReturnValue(
        new Promise((r) => {
          resolvePromise = r;
        }),
      );

      const { deleteComment, loading } = useComments();
      const promise = deleteComment('p1', 'c1');
      expect(loading.value).toBe(true);

      (resolvePromise as (v: Response) => void)(mockResponse({}));
      await promise;
      expect(loading.value).toBe(false);
    });

    it('should clear previous error on new call', async () => {
      mockApiFetch.mockResolvedValueOnce(mockResponse({ error: 'fail' }, false));

      const { deleteComment, error } = useComments();
      await deleteComment('p1', 'c1');
      expect(error.value).toBeTruthy();

      mockApiFetch.mockResolvedValueOnce(mockResponse({}));
      await deleteComment('p1', 'c1');
      expect(error.value).toBeNull();
    });
  });

  describe('subscribeRealtime', () => {
    it('should subscribe to the post channel', () => {
      const mockCleanup = vi.fn();
      mockSubscribe.mockReturnValue(mockCleanup);

      const { subscribeRealtime } = useComments();
      const cleanup = subscribeRealtime('p1');

      expect(mockSubscribe).toHaveBeenCalledWith('post:p1', expect.any(Function));
      expect(cleanup).toBe(mockCleanup);
    });

    it('should handle comment:new by adding to store', () => {
      const store = useCommentsStore();
      mockSubscribe.mockImplementation((_channel: string, handler: (event: unknown) => void) => {
        handler({ type: 'comment:new', channel: 'post:p1', data: mockComment });
        return vi.fn();
      });

      const { subscribeRealtime } = useComments();
      subscribeRealtime('p1');

      expect(store.comments).toEqual([mockComment]);
    });

    it('should handle comment:updated by updating store', () => {
      const store = useCommentsStore();
      store.setComments([mockComment]);

      const updated: Comment = { ...mockComment, body: 'Updated via WS' };
      mockSubscribe.mockImplementation((_channel: string, handler: (event: unknown) => void) => {
        handler({ type: 'comment:updated', channel: 'post:p1', data: updated });
        return vi.fn();
      });

      const { subscribeRealtime } = useComments();
      subscribeRealtime('p1');

      expect(store.comments[0].body).toBe('Updated via WS');
    });

    it('should handle comment:deleted by removing from store', () => {
      const store = useCommentsStore();
      store.setComments([mockComment]);

      mockSubscribe.mockImplementation((_channel: string, handler: (event: unknown) => void) => {
        handler({ type: 'comment:deleted', channel: 'post:p1', data: { id: 'c1' } });
        return vi.fn();
      });

      const { subscribeRealtime } = useComments();
      subscribeRealtime('p1');

      expect(store.comments).toEqual([]);
    });

    it('should ignore non-comment event types', () => {
      const store = useCommentsStore();
      store.setComments([mockComment]);

      mockSubscribe.mockImplementation((_channel: string, handler: (event: unknown) => void) => {
        handler({ type: 'presence:update', channel: 'post:p1', data: { users: [] } });
        return vi.fn();
      });

      const { subscribeRealtime } = useComments();
      subscribeRealtime('p1');

      // Store should be unchanged
      expect(store.comments).toEqual([mockComment]);
    });
  });
});
