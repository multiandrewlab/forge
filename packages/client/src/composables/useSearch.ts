import { storeToRefs } from 'pinia';
import { useSearchStore } from '@/stores/search';
import { apiFetch } from '@/lib/api';
import { debounce } from '@/lib/debounce';
import type { SearchResponse } from '@forge/shared';

/**
 * Optional URL params accepted by the dedicated /search page.
 * The compact dropdown caller (TheSearchModal) ignores these.
 */
export interface SearchParams {
  type?: string;
  tag?: string;
  fuzzy?: boolean;
  ai?: boolean;
  author?: string;
  since?: string;
  page?: number;
  limit?: number;
}

/**
 * Build the /api/search URL from a query and optional params.
 * Exported for testability and to keep URL construction in one place.
 */
export function buildSearchUrl(q: string, opts: SearchParams = {}, aiEnabled = false): string {
  const params = new URLSearchParams();
  params.set('q', q);
  if (opts.type) params.set('type', opts.type);
  if (opts.tag) params.set('tag', opts.tag);
  if (opts.fuzzy === true) params.set('fuzzy', 'true');
  if (aiEnabled) params.set('ai', 'true');
  if (opts.author) params.set('author', opts.author);
  if (opts.since) params.set('since', opts.since);
  if (opts.page !== undefined && opts.page > 1) params.set('page', String(opts.page));
  if (opts.limit !== undefined) params.set('limit', String(opts.limit));
  return `/api/search?${params.toString()}`;
}

export function useSearch() {
  const store = useSearchStore();
  const { query, results, isLoading, aiEnabled } = storeToRefs(store);

  async function runSearch(q: string, opts: SearchParams = {}): Promise<void> {
    const trimmed = q.trim();
    store.setLoading(true);
    try {
      const aiEnabled = opts.ai ?? store.aiEnabled;
      const url = buildSearchUrl(trimmed, opts, aiEnabled);
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

  function search(q: string, opts: SearchParams = {}): void {
    const trimmed = q.trim();
    if (trimmed === '') {
      debouncedSearch.cancel();
      store.clearResults();
      return;
    }
    debouncedSearch(q, opts);
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
    runSearch,
    clearResults,
  };
}
