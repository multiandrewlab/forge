import { storeToRefs } from 'pinia';
import { useSearchStore } from '@/stores/search';
import { apiFetch } from '@/lib/api';
import { debounce } from '@/lib/debounce';
import type { SearchResponse } from '@forge/shared';

export function useSearch() {
  const store = useSearchStore();
  const { query, results, isLoading, aiEnabled } = storeToRefs(store);

  async function runSearch(q: string): Promise<void> {
    const trimmed = q.trim();
    store.setLoading(true);
    try {
      const url = `/api/search?q=${encodeURIComponent(trimmed)}${store.aiEnabled ? '&ai=true' : ''}`;
      const response = await apiFetch(url);

      if (!response.ok) {
        store.setResults(null);
        console.warn('Search failed:', response.status);
        return;
      }

      const body = (await response.json()) as SearchResponse;
      store.setResults(body);
      store.pushRecent(trimmed);
    } catch (err: unknown) {
      store.setResults(null);
      console.warn('Search failed:', err);
    } finally {
      store.setLoading(false);
    }
  }

  const debouncedSearch = debounce(runSearch, 300);

  function search(q: string): void {
    const trimmed = q.trim();
    if (trimmed === '') {
      debouncedSearch.cancel();
      store.clearResults();
      return;
    }
    debouncedSearch(q);
  }

  function clearResults(): void {
    debouncedSearch.cancel();
    store.clearResults();
  }

  return {
    query,
    results,
    isLoading,
    aiEnabled,
    toggleAi: store.toggleAi,
    search,
    clearResults,
  };
}
