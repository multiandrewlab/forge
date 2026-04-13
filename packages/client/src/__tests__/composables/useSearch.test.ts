import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSearchStore } from '../../stores/search.js';
import type { SearchResponse } from '@forge/shared';

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

import { useSearch } from '../../composables/useSearch.js';

const FAKE_SEARCH_RESPONSE: SearchResponse = {
  snippets: [],
  aiActions: [],
  people: [],
  query: 'vue',
  totalResults: 0,
};

describe('useSearch', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns query, results, isLoading, search, and clearResults', () => {
    const composable = useSearch();
    expect(composable).toHaveProperty('query');
    expect(composable).toHaveProperty('results');
    expect(composable).toHaveProperty('isLoading');
    expect(composable).toHaveProperty('search');
    expect(composable).toHaveProperty('clearResults');
  });

  it('exposes store refs via storeToRefs', () => {
    const store = useSearchStore();
    const { query, results, isLoading } = useSearch();

    store.setQuery('hello');
    expect(query.value).toBe('hello');

    store.setLoading(true);
    expect(isLoading.value).toBe(true);

    store.setResults(FAKE_SEARCH_RESPONSE);
    expect(results.value).toEqual(FAKE_SEARCH_RESPONSE);
  });

  describe('search (empty / whitespace)', () => {
    it('does not call fetch for empty query and clears results', async () => {
      const store = useSearchStore();
      store.setResults(FAKE_SEARCH_RESPONSE);

      const { search } = useSearch();
      search('');
      await vi.advanceTimersByTimeAsync(300);

      expect(mockApiFetch).not.toHaveBeenCalled();
      expect(store.results).toBeNull();
      expect(store.query).toBe('');
    });

    it('does not call fetch for whitespace-only query and clears results', async () => {
      const store = useSearchStore();
      store.setResults(FAKE_SEARCH_RESPONSE);

      const { search } = useSearch();
      search('   ');
      await vi.advanceTimersByTimeAsync(300);

      expect(mockApiFetch).not.toHaveBeenCalled();
      expect(store.results).toBeNull();
      expect(store.query).toBe('');
    });
  });

  describe('search (non-empty query after debounce)', () => {
    it('calls fetch once with the correct URL after 300ms', async () => {
      mockApiFetch.mockResolvedValue(mockResponse(FAKE_SEARCH_RESPONSE));

      const { search } = useSearch();
      search('vue');
      await vi.advanceTimersByTimeAsync(300);

      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      expect(mockApiFetch).toHaveBeenCalledWith('/api/search?q=vue');
    });

    it('does not call fetch before 300ms', () => {
      mockApiFetch.mockResolvedValue(mockResponse(FAKE_SEARCH_RESPONSE));

      const { search } = useSearch();
      search('vue');
      vi.advanceTimersByTime(299);

      expect(mockApiFetch).not.toHaveBeenCalled();
    });
  });

  describe('rapid queries within debounce window', () => {
    it('calls fetch exactly once with the latest query', async () => {
      mockApiFetch.mockResolvedValue(mockResponse(FAKE_SEARCH_RESPONSE));

      const { search } = useSearch();
      search('v');
      vi.advanceTimersByTime(100);
      search('vu');
      vi.advanceTimersByTime(100);
      search('vue');
      await vi.advanceTimersByTimeAsync(300);

      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      expect(mockApiFetch).toHaveBeenCalledWith('/api/search?q=vue');
    });
  });

  describe('successful fetch response', () => {
    it('sets results and pushes recent query', async () => {
      mockApiFetch.mockResolvedValue(mockResponse(FAKE_SEARCH_RESPONSE));
      const store = useSearchStore();

      const { search } = useSearch();
      search('vue');
      await vi.advanceTimersByTimeAsync(300);

      expect(store.results).toEqual(FAKE_SEARCH_RESPONSE);
      expect(store.recentQueries).toContain('vue');
    });

    it('sets isLoading true during fetch and false after', async () => {
      let resolveApiFetch: ((v: Response) => void) | undefined;
      mockApiFetch.mockReturnValue(
        new Promise<Response>((r) => {
          resolveApiFetch = r;
        }),
      );

      const store = useSearchStore();
      const { search } = useSearch();
      search('vue');
      await vi.advanceTimersByTimeAsync(300);

      expect(store.isLoading).toBe(true);

      const resolve = resolveApiFetch as (v: Response) => void;
      resolve(mockResponse(FAKE_SEARCH_RESPONSE));
      await vi.advanceTimersByTimeAsync(0);

      expect(store.isLoading).toBe(false);
    });
  });

  describe('non-2xx response', () => {
    it('sets results to null and calls console.warn', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockApiFetch.mockResolvedValue(mockResponse({ error: 'Not found' }, false));

      const store = useSearchStore();
      const { search } = useSearch();
      search('vue');
      await vi.advanceTimersByTimeAsync(300);

      expect(store.results).toBeNull();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('sets isLoading to false after non-2xx', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockApiFetch.mockResolvedValue(mockResponse({ error: 'fail' }, false));

      const store = useSearchStore();
      const { search } = useSearch();
      search('vue');
      await vi.advanceTimersByTimeAsync(300);

      expect(store.isLoading).toBe(false);
      vi.restoreAllMocks();
    });
  });

  describe('network error (fetch rejects)', () => {
    it('sets results to null and calls console.warn', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const store = useSearchStore();
      const { search } = useSearch();
      search('vue');
      await vi.advanceTimersByTimeAsync(300);

      expect(store.results).toBeNull();
      expect(warnSpy).toHaveBeenCalledWith('Search failed:', expect.any(Error));
      warnSpy.mockRestore();
    });

    it('sets isLoading to false after network error', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const store = useSearchStore();
      const { search } = useSearch();
      search('vue');
      await vi.advanceTimersByTimeAsync(300);

      expect(store.isLoading).toBe(false);
      vi.restoreAllMocks();
    });
  });

  describe('clearResults', () => {
    it('cancels pending debounce so no fetch fires', async () => {
      mockApiFetch.mockResolvedValue(mockResponse(FAKE_SEARCH_RESPONSE));

      const { search, clearResults } = useSearch();
      search('vue');
      vi.advanceTimersByTime(100);
      clearResults();
      await vi.advanceTimersByTimeAsync(300);

      expect(mockApiFetch).not.toHaveBeenCalled();
    });

    it('calls store clearResults', () => {
      const store = useSearchStore();
      store.setResults(FAKE_SEARCH_RESPONSE);
      store.setQuery('vue');

      const { clearResults } = useSearch();
      clearResults();

      expect(store.results).toBeNull();
      expect(store.query).toBe('');
    });
  });

  describe('search function stability', () => {
    it('returns the same search function reference across calls', () => {
      const composable = useSearch();
      const ref1 = composable.search;
      const ref2 = composable.search;
      expect(ref1).toBe(ref2);
    });
  });

  describe('encodeURIComponent for special characters', () => {
    it('encodes query parameter correctly', async () => {
      mockApiFetch.mockResolvedValue(mockResponse(FAKE_SEARCH_RESPONSE));

      const { search } = useSearch();
      search('hello world&foo=bar');
      await vi.advanceTimersByTimeAsync(300);

      expect(mockApiFetch).toHaveBeenCalledWith('/api/search?q=hello%20world%26foo%3Dbar');
    });
  });
});
