import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSearchStore } from '@/stores/search';
import type { SearchResponse } from '@forge/shared';

const STORAGE_KEY = 'forge:search:recent';

function createMockSearchResponse(overrides: Partial<SearchResponse> = {}): SearchResponse {
  return {
    snippets: [],
    aiActions: [],
    people: [],
    query: 'test',
    totalResults: 0,
    ...overrides,
  };
}

describe('useSearchStore', () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('should have default values', () => {
      const store = useSearchStore();

      expect(store.query).toBe('');
      expect(store.results).toBeNull();
      expect(store.isLoading).toBe(false);
      expect(store.isOpen).toBe(false);
      expect(store.recentQueries).toEqual([]);
      expect(store.activeIndex).toBe(0);
      expect(store.aiEnabled).toBe(false);
    });

    it('should load recentQueries from localStorage', () => {
      const saved = ['react', 'vue', 'angular'];
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      // Re-create pinia to force re-init of store
      setActivePinia(createPinia());
      const store = useSearchStore();

      expect(store.recentQueries).toEqual(saved);
    });

    it('should default to empty array when localStorage returns null', () => {
      // localStorage is already clear
      const store = useSearchStore();

      expect(store.recentQueries).toEqual([]);
    });

    it('should default to empty array when localStorage has invalid JSON', () => {
      localStorage.setItem(STORAGE_KEY, '{not valid json!!!');
      setActivePinia(createPinia());
      const store = useSearchStore();

      expect(store.recentQueries).toEqual([]);
    });

    it('should default to empty array when localStorage has valid JSON but not an array', () => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ not: 'an array' }));
      setActivePinia(createPinia());
      const store = useSearchStore();

      expect(store.recentQueries).toEqual([]);
    });

    it('should not throw and default to [] when globalThis.localStorage is undefined (SSR)', () => {
      const original = globalThis.localStorage;
      // Simulate an SSR / non-browser env where localStorage is undefined.
      // Casting via unknown because the type forbids assigning undefined to localStorage.
      (globalThis as unknown as { localStorage: Storage | undefined }).localStorage = undefined;
      try {
        setActivePinia(createPinia());
        const store = useSearchStore();
        expect(store.recentQueries).toEqual([]);
      } finally {
        (globalThis as unknown as { localStorage: Storage }).localStorage = original;
      }
    });

    it('pushRecent does not throw when localStorage is undefined', () => {
      const original = globalThis.localStorage;
      (globalThis as unknown as { localStorage: Storage | undefined }).localStorage = undefined;
      try {
        setActivePinia(createPinia());
        const store = useSearchStore();
        expect(() => store.pushRecent('react')).not.toThrow();
        // In-memory state still updates even though persistence failed.
        expect(store.recentQueries).toEqual(['react']);
      } finally {
        (globalThis as unknown as { localStorage: Storage }).localStorage = original;
      }
    });
  });

  describe('setQuery', () => {
    it('should update query', () => {
      const store = useSearchStore();

      store.setQuery('hello');
      expect(store.query).toBe('hello');
    });
  });

  describe('setResults', () => {
    it('should set results to a SearchResponse', () => {
      const store = useSearchStore();
      const response = createMockSearchResponse({ query: 'foo' });

      store.setResults(response);
      expect(store.results).toEqual(response);
    });

    it('should set results to null', () => {
      const store = useSearchStore();
      store.setResults(createMockSearchResponse());

      store.setResults(null);
      expect(store.results).toBeNull();
    });
  });

  describe('setLoading', () => {
    it('should set isLoading to true', () => {
      const store = useSearchStore();

      store.setLoading(true);
      expect(store.isLoading).toBe(true);
    });

    it('should set isLoading to false', () => {
      const store = useSearchStore();
      store.setLoading(true);

      store.setLoading(false);
      expect(store.isLoading).toBe(false);
    });
  });

  describe('open', () => {
    it('should set isOpen to true', () => {
      const store = useSearchStore();

      store.open();
      expect(store.isOpen).toBe(true);
    });

    it('should reset activeIndex to 0', () => {
      const store = useSearchStore();
      store.setActiveIndex(5);

      store.open();
      expect(store.activeIndex).toBe(0);
    });

    it('should not reset aiEnabled', () => {
      const store = useSearchStore();
      store.toggleAi();
      expect(store.aiEnabled).toBe(true);

      store.open();
      expect(store.aiEnabled).toBe(true);
    });
  });

  describe('close', () => {
    it('should set isOpen to false', () => {
      const store = useSearchStore();
      store.open();

      store.close();
      expect(store.isOpen).toBe(false);
    });

    it('should clear query, results, and activeIndex', () => {
      const store = useSearchStore();
      store.setQuery('test');
      store.setResults(createMockSearchResponse());
      store.setActiveIndex(3);
      store.open();

      store.close();
      expect(store.query).toBe('');
      expect(store.results).toBeNull();
      expect(store.activeIndex).toBe(0);
    });

    it('should NOT reset aiEnabled', () => {
      const store = useSearchStore();
      store.toggleAi();
      expect(store.aiEnabled).toBe(true);

      store.open();
      store.close();
      expect(store.aiEnabled).toBe(true);
    });
  });

  describe('toggleAi', () => {
    it('should flip aiEnabled from false to true', () => {
      const store = useSearchStore();
      expect(store.aiEnabled).toBe(false);

      store.toggleAi();
      expect(store.aiEnabled).toBe(true);
    });

    it('should flip aiEnabled from true to false', () => {
      const store = useSearchStore();
      store.toggleAi();
      expect(store.aiEnabled).toBe(true);

      store.toggleAi();
      expect(store.aiEnabled).toBe(false);
    });
  });

  describe('clearResults', () => {
    it('should set results to null and query to empty string', () => {
      const store = useSearchStore();
      store.setQuery('something');
      store.setResults(createMockSearchResponse());

      store.clearResults();
      expect(store.results).toBeNull();
      expect(store.query).toBe('');
    });
  });

  describe('setActiveIndex', () => {
    it('should update activeIndex', () => {
      const store = useSearchStore();

      store.setActiveIndex(7);
      expect(store.activeIndex).toBe(7);
    });
  });

  describe('pushRecent', () => {
    it('should add a query to recentQueries', () => {
      const store = useSearchStore();

      store.pushRecent('react');
      expect(store.recentQueries).toEqual(['react']);
    });

    it('should dedupe case-insensitively and move to front', () => {
      const store = useSearchStore();

      store.pushRecent('react');
      store.pushRecent('vue');
      store.pushRecent('React');

      expect(store.recentQueries).toEqual(['React', 'vue']);
    });

    it('should cap at 10 entries, dropping oldest', () => {
      const store = useSearchStore();

      for (let i = 1; i <= 12; i++) {
        store.pushRecent(`query-${i}`);
      }

      expect(store.recentQueries).toHaveLength(10);
      expect(store.recentQueries[0]).toBe('query-12');
      expect(store.recentQueries[9]).toBe('query-3');
    });

    it('should persist to localStorage', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem');
      const store = useSearchStore();

      store.pushRecent('typescript');

      expect(spy).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(['typescript']));
      spy.mockRestore();
    });

    it('should swallow localStorage.setItem errors', () => {
      const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
      const store = useSearchStore();

      // Should not throw
      expect(() => store.pushRecent('test')).not.toThrow();
      expect(store.recentQueries).toEqual(['test']);

      spy.mockRestore();
    });
  });
});
