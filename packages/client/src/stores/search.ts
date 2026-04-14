import { ref } from 'vue';
import { defineStore } from 'pinia';
import type { SearchResponse } from '@forge/shared';

const STORAGE_KEY = 'forge:search:recent';

function loadRecentQueries(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed as string[];
  } catch {
    return [];
  }
}

function persistRecentQueries(queries: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queries));
  } catch {
    // Swallow errors (e.g. QuotaExceededError, SSR)
  }
}

export const useSearchStore = defineStore('search', () => {
  const query = ref('');
  const results = ref<SearchResponse | null>(null);
  const isLoading = ref(false);
  const isOpen = ref(false);
  const recentQueries = ref<string[]>(loadRecentQueries());
  const activeIndex = ref(0);
  const aiEnabled = ref(false);

  function setQuery(q: string): void {
    query.value = q;
  }

  function setResults(r: SearchResponse | null): void {
    results.value = r;
  }

  function setLoading(v: boolean): void {
    isLoading.value = v;
  }

  function open(): void {
    isOpen.value = true;
    activeIndex.value = 0;
  }

  function close(): void {
    isOpen.value = false;
    query.value = '';
    results.value = null;
    activeIndex.value = 0;
  }

  function pushRecent(q: string): void {
    const filtered = recentQueries.value.filter(
      (existing) => existing.toLowerCase() !== q.toLowerCase(),
    );
    filtered.unshift(q);
    if (filtered.length > 10) {
      filtered.length = 10;
    }
    recentQueries.value = filtered;
    persistRecentQueries(filtered);
  }

  function clearResults(): void {
    results.value = null;
    query.value = '';
  }

  function setActiveIndex(i: number): void {
    activeIndex.value = i;
  }

  function toggleAi(): void {
    aiEnabled.value = !aiEnabled.value;
  }

  return {
    query,
    results,
    isLoading,
    isOpen,
    recentQueries,
    activeIndex,
    aiEnabled,
    setQuery,
    setResults,
    setLoading,
    open,
    close,
    pushRecent,
    clearResults,
    setActiveIndex,
    toggleAi,
  };
});
