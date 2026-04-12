import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useFeedStore } from '../../stores/feed.js';
import type { BookmarkToggleResponse } from '@forge/shared';

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

import { useBookmarks } from '../../composables/useBookmarks.js';

describe('useBookmarks', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
  });

  describe('toggleBookmark', () => {
    it('should POST to /api/posts/:id/bookmark and update store (bookmarked)', async () => {
      const bookmarkResponse: BookmarkToggleResponse = { bookmarked: true };
      mockApiFetch.mockResolvedValue(mockResponse(bookmarkResponse));

      const store = useFeedStore();
      const { toggleBookmark } = useBookmarks();
      await toggleBookmark('1');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/1/bookmark', {
        method: 'POST',
      });
      expect(store.userBookmarks['1']).toBe(true);
    });

    it('should update store when unbookmarked', async () => {
      const store = useFeedStore();
      store.setBookmark('1', true);

      const bookmarkResponse: BookmarkToggleResponse = { bookmarked: false };
      mockApiFetch.mockResolvedValue(mockResponse(bookmarkResponse));

      const { toggleBookmark } = useBookmarks();
      await toggleBookmark('1');

      expect(store.userBookmarks['1']).toBeUndefined();
    });

    it('should set error on non-ok response', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({ error: 'Unauthorized' }, false));

      const { toggleBookmark, error } = useBookmarks();
      await toggleBookmark('1');

      expect(error.value).toBe('Unauthorized');
    });

    it('should use fallback error when response has no error field', async () => {
      mockApiFetch.mockResolvedValue(mockResponse({}, false));

      const { toggleBookmark, error } = useBookmarks();
      await toggleBookmark('1');

      expect(error.value).toBe('Failed to toggle bookmark');
    });

    it('should use fallback error when response json parse fails', async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('parse fail')),
      } as unknown as Response);

      const { toggleBookmark, error } = useBookmarks();
      await toggleBookmark('1');

      expect(error.value).toBe('Failed to toggle bookmark');
    });

    it('should set error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { toggleBookmark, error } = useBookmarks();
      await toggleBookmark('1');

      expect(error.value).toBe('Network error');
    });

    it('should use fallback error for non-Error thrown values', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { toggleBookmark, error } = useBookmarks();
      await toggleBookmark('1');

      expect(error.value).toBe('Failed to toggle bookmark');
    });

    it('should set loading during request', async () => {
      let resolvePromise: (v: Response) => void;
      mockApiFetch.mockReturnValue(
        new Promise((r) => {
          resolvePromise = r;
        }),
      );

      const { toggleBookmark, loading } = useBookmarks();
      const promise = toggleBookmark('1');
      expect(loading.value).toBe(true);

      const bookmarkResponse: BookmarkToggleResponse = { bookmarked: true };
      (resolvePromise as (v: Response) => void)(mockResponse(bookmarkResponse));
      await promise;
      expect(loading.value).toBe(false);
    });

    it('should clear previous error on new call', async () => {
      mockApiFetch.mockResolvedValueOnce(mockResponse({ error: 'fail' }, false));

      const { toggleBookmark, error } = useBookmarks();
      await toggleBookmark('1');
      expect(error.value).toBeTruthy();

      const bookmarkResponse: BookmarkToggleResponse = { bookmarked: true };
      mockApiFetch.mockResolvedValueOnce(mockResponse(bookmarkResponse));
      await toggleBookmark('1');
      expect(error.value).toBeNull();
    });
  });
});
