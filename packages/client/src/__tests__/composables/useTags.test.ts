import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { apiFetch } from '../../lib/api.js';
import { useTags } from '../../composables/useTags.js';
import type { Tag } from '@forge/shared';

vi.mock('../../lib/api.js', () => ({ apiFetch: vi.fn() }));
const mockApiFetch = apiFetch as Mock;

const mockTag1: Tag = { id: 't1', name: 'typescript', postCount: 10 };
const mockTag2: Tag = { id: 't2', name: 'vue', postCount: 5 };

function mockFetchResponse(data: unknown, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    json: () => Promise.resolve(data),
  } as Response;
}

describe('useTags', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
  });

  describe('loadSubscriptions', () => {
    it('fetches subscriptions and sets store', async () => {
      mockApiFetch.mockResolvedValue(mockFetchResponse({ tags: [mockTag1, mockTag2] }));
      const { loadSubscriptions, subscribedTags } = useTags();
      await loadSubscriptions();
      expect(mockApiFetch).toHaveBeenCalledWith('/api/tags/subscriptions');
      expect(subscribedTags.value).toEqual([mockTag1, mockTag2]);
    });

    it('sets error on non-ok response', async () => {
      mockApiFetch.mockResolvedValue(mockFetchResponse({ error: 'Unauthorized' }, false));
      const { loadSubscriptions, error } = useTags();
      await loadSubscriptions();
      expect(error.value).toBe('Unauthorized');
    });

    it('uses fallback error when response has no error field', async () => {
      mockApiFetch.mockResolvedValue(mockFetchResponse({}, false));
      const { loadSubscriptions, error } = useTags();
      await loadSubscriptions();
      expect(error.value).toBe('Failed to load subscriptions');
    });

    it('uses fallback error when response json parse fails', async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('parse fail')),
      } as unknown as Response);
      const { loadSubscriptions, error } = useTags();
      await loadSubscriptions();
      expect(error.value).toBe('Failed to load subscriptions');
    });

    it('sets network error on exception', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network failure'));
      const { loadSubscriptions, error } = useTags();
      await loadSubscriptions();
      expect(error.value).toBe('Network error');
    });

    it('sets loading during fetch', async () => {
      let resolvePromise: (v: Response) => void;
      mockApiFetch.mockReturnValue(
        new Promise((r) => {
          resolvePromise = r;
        }),
      );
      const { loadSubscriptions, loading } = useTags();
      const promise = loadSubscriptions();
      expect(loading.value).toBe(true);
      (resolvePromise as (v: Response) => void)(mockFetchResponse({ tags: [] }));
      await promise;
      expect(loading.value).toBe(false);
    });

    it('clears error on next load', async () => {
      mockApiFetch.mockResolvedValueOnce(mockFetchResponse({}, false));
      const { loadSubscriptions, error } = useTags();
      await loadSubscriptions();
      expect(error.value).toBeTruthy();

      mockApiFetch.mockResolvedValueOnce(mockFetchResponse({ tags: [] }));
      await loadSubscriptions();
      expect(error.value).toBeNull();
    });
  });

  describe('loadPopularTags', () => {
    it('fetches popular tags with limit and sets store', async () => {
      mockApiFetch.mockResolvedValue(mockFetchResponse({ tags: [mockTag1] }));
      const { loadPopularTags, popularTags } = useTags();
      await loadPopularTags(10);
      expect(mockApiFetch).toHaveBeenCalledWith('/api/tags/popular?limit=10');
      expect(popularTags.value).toEqual([mockTag1]);
    });

    it('sets error on non-ok response', async () => {
      mockApiFetch.mockResolvedValue(mockFetchResponse({ error: 'Server error' }, false));
      const { loadPopularTags, error } = useTags();
      await loadPopularTags(5);
      expect(error.value).toBe('Server error');
    });

    it('uses fallback error when response has no error field', async () => {
      mockApiFetch.mockResolvedValue(mockFetchResponse({}, false));
      const { loadPopularTags, error } = useTags();
      await loadPopularTags(5);
      expect(error.value).toBe('Failed to load popular tags');
    });

    it('uses fallback error when response json parse fails', async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('parse fail')),
      } as unknown as Response);
      const { loadPopularTags, error } = useTags();
      await loadPopularTags(5);
      expect(error.value).toBe('Failed to load popular tags');
    });

    it('sets network error on exception', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network failure'));
      const { loadPopularTags, error } = useTags();
      await loadPopularTags(5);
      expect(error.value).toBe('Network error');
    });

    it('sets loading during fetch', async () => {
      let resolvePromise: (v: Response) => void;
      mockApiFetch.mockReturnValue(
        new Promise((r) => {
          resolvePromise = r;
        }),
      );
      const { loadPopularTags, loading } = useTags();
      const promise = loadPopularTags(10);
      expect(loading.value).toBe(true);
      (resolvePromise as (v: Response) => void)(mockFetchResponse({ tags: [] }));
      await promise;
      expect(loading.value).toBe(false);
    });
  });

  describe('searchTags', () => {
    it('fetches tags with query and limit', async () => {
      mockApiFetch.mockResolvedValue(mockFetchResponse({ tags: [mockTag1] }));
      const { searchTags } = useTags();
      const result = await searchTags('type', 10);
      expect(mockApiFetch).toHaveBeenCalledWith('/api/tags?q=type&limit=10');
      expect(result).toEqual([mockTag1]);
    });

    it('encodes query parameter', async () => {
      mockApiFetch.mockResolvedValue(mockFetchResponse({ tags: [] }));
      const { searchTags } = useTags();
      await searchTags('c++', 5);
      expect(mockApiFetch).toHaveBeenCalledWith('/api/tags?q=c%2B%2B&limit=5');
    });

    it('sets error on non-ok response and returns empty array', async () => {
      mockApiFetch.mockResolvedValue(mockFetchResponse({ error: 'Bad request' }, false));
      const { searchTags, error } = useTags();
      const result = await searchTags('test', 5);
      expect(error.value).toBe('Bad request');
      expect(result).toEqual([]);
    });

    it('uses fallback error when response has no error field', async () => {
      mockApiFetch.mockResolvedValue(mockFetchResponse({}, false));
      const { searchTags, error } = useTags();
      const result = await searchTags('test', 5);
      expect(error.value).toBe('Failed to search tags');
      expect(result).toEqual([]);
    });

    it('uses fallback error when response json parse fails', async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('parse fail')),
      } as unknown as Response);
      const { searchTags, error } = useTags();
      const result = await searchTags('test', 5);
      expect(error.value).toBe('Failed to search tags');
      expect(result).toEqual([]);
    });

    it('returns empty array and sets network error on exception', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network failure'));
      const { searchTags, error } = useTags();
      const result = await searchTags('test', 5);
      expect(error.value).toBe('Network error');
      expect(result).toEqual([]);
    });

    it('sets loading during search', async () => {
      let resolvePromise: (v: Response) => void;
      mockApiFetch.mockReturnValue(
        new Promise((r) => {
          resolvePromise = r;
        }),
      );
      const { searchTags, loading } = useTags();
      const promise = searchTags('test', 5);
      expect(loading.value).toBe(true);
      (resolvePromise as (v: Response) => void)(mockFetchResponse({ tags: [] }));
      await promise;
      expect(loading.value).toBe(false);
    });
  });

  describe('subscribe', () => {
    it('posts to subscribe endpoint and adds tag to store', async () => {
      mockApiFetch.mockResolvedValue(mockFetchResponse({ subscribed: true }));
      const { subscribe, subscribedTags } = useTags();
      await subscribe(mockTag1);
      expect(mockApiFetch).toHaveBeenCalledWith('/api/tags/t1/subscribe', {
        method: 'POST',
      });
      expect(subscribedTags.value).toEqual([mockTag1]);
    });

    it('sets error on non-ok response', async () => {
      mockApiFetch.mockResolvedValue(mockFetchResponse({ error: 'Not found' }, false));
      const { subscribe, error, subscribedTags } = useTags();
      await subscribe(mockTag1);
      expect(error.value).toBe('Not found');
      expect(subscribedTags.value).toEqual([]);
    });

    it('uses fallback error when response has no error field', async () => {
      mockApiFetch.mockResolvedValue(mockFetchResponse({}, false));
      const { subscribe, error } = useTags();
      await subscribe(mockTag1);
      expect(error.value).toBe('Failed to subscribe');
    });

    it('uses fallback error when response json parse fails', async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('parse fail')),
      } as unknown as Response);
      const { subscribe, error } = useTags();
      await subscribe(mockTag1);
      expect(error.value).toBe('Failed to subscribe');
    });

    it('sets network error on exception', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network failure'));
      const { subscribe, error } = useTags();
      await subscribe(mockTag1);
      expect(error.value).toBe('Network error');
    });

    it('sets loading during subscribe', async () => {
      let resolvePromise: (v: Response) => void;
      mockApiFetch.mockReturnValue(
        new Promise((r) => {
          resolvePromise = r;
        }),
      );
      const { subscribe, loading } = useTags();
      const promise = subscribe(mockTag1);
      expect(loading.value).toBe(true);
      (resolvePromise as (v: Response) => void)(mockFetchResponse({ subscribed: true }));
      await promise;
      expect(loading.value).toBe(false);
    });
  });

  describe('unsubscribe', () => {
    it('deletes subscription and removes tag from store', async () => {
      mockApiFetch.mockResolvedValueOnce(mockFetchResponse({ tags: [mockTag1, mockTag2] }));
      const { loadSubscriptions, unsubscribe, subscribedTags } = useTags();
      await loadSubscriptions();
      expect(subscribedTags.value).toHaveLength(2);

      mockApiFetch.mockResolvedValueOnce(mockFetchResponse({ subscribed: false }));
      await unsubscribe('t1');
      expect(mockApiFetch).toHaveBeenLastCalledWith('/api/tags/t1/subscribe', {
        method: 'DELETE',
      });
      expect(subscribedTags.value).toEqual([mockTag2]);
    });

    it('sets error on non-ok response', async () => {
      mockApiFetch.mockResolvedValue(mockFetchResponse({ error: 'Not found' }, false));
      const { unsubscribe, error } = useTags();
      await unsubscribe('t1');
      expect(error.value).toBe('Not found');
    });

    it('uses fallback error when response has no error field', async () => {
      mockApiFetch.mockResolvedValue(mockFetchResponse({}, false));
      const { unsubscribe, error } = useTags();
      await unsubscribe('t1');
      expect(error.value).toBe('Failed to unsubscribe');
    });

    it('uses fallback error when response json parse fails', async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('parse fail')),
      } as unknown as Response);
      const { unsubscribe, error } = useTags();
      await unsubscribe('t1');
      expect(error.value).toBe('Failed to unsubscribe');
    });

    it('sets network error on exception', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network failure'));
      const { unsubscribe, error } = useTags();
      await unsubscribe('t1');
      expect(error.value).toBe('Network error');
    });

    it('sets loading during unsubscribe', async () => {
      let resolvePromise: (v: Response) => void;
      mockApiFetch.mockReturnValue(
        new Promise((r) => {
          resolvePromise = r;
        }),
      );
      const { unsubscribe, loading } = useTags();
      const promise = unsubscribe('t1');
      expect(loading.value).toBe(true);
      (resolvePromise as (v: Response) => void)(mockFetchResponse({ subscribed: false }));
      await promise;
      expect(loading.value).toBe(false);
    });
  });
});
