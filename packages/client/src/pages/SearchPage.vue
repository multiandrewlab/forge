<template>
  <div class="mx-auto max-w-4xl px-4 py-6">
    <!-- Empty q: Start typing prompt -->
    <div v-if="!q" class="flex flex-col items-center justify-center py-20 text-center">
      <p class="mb-4 text-lg text-gray-400">Start typing to search</p>
      <button
        data-testid="open-search-cta"
        class="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90"
        @click="searchStore.open()"
      >
        Open search
      </button>
    </div>

    <!-- Has q -->
    <template v-else>
      <!-- Header -->
      <h1 class="mb-4 text-2xl font-bold text-gray-100">
        Results for <span class="text-primary">{{ q }}</span>
      </h1>

      <!-- Filter chips -->
      <div v-if="typeFilter || tagFilter" class="mb-4 flex flex-wrap gap-2">
        <span
          v-if="typeFilter"
          data-testid="filter-chip-type"
          class="inline-flex items-center gap-1 rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-200"
        >
          {{ typeFilter }}
          <button
            data-testid="remove-filter-type"
            class="ml-1 text-gray-400 hover:text-white"
            aria-label="Remove type filter"
            @click="removeFilter('type')"
          >
            &times;
          </button>
        </span>
        <span
          v-if="tagFilter"
          data-testid="filter-chip-tag"
          class="inline-flex items-center gap-1 rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-200"
        >
          {{ tagFilter }}
          <button
            data-testid="remove-filter-tag"
            class="ml-1 text-gray-400 hover:text-white"
            aria-label="Remove tag filter"
            @click="removeFilter('tag')"
          >
            &times;
          </button>
        </span>
      </div>

      <!-- Loading -->
      <div
        v-if="searchStore.isLoading"
        data-testid="search-page-loading"
        class="py-12 text-center text-sm text-gray-500"
      >
        Searching...
      </div>

      <!-- No results -->
      <div v-else-if="hasNoResults" class="py-12 text-center">
        <p class="text-gray-400">
          No results for <span class="font-medium text-gray-200">{{ q }}</span>
        </p>
        <button
          v-if="!isFuzzy"
          data-testid="try-fuzzy-link"
          class="mt-3 text-sm text-primary hover:underline"
          @click="tryFuzzy"
        >
          Try fuzzy search
        </button>
      </div>

      <!-- Result groups -->
      <div v-else-if="searchStore.results">
        <SearchResultGroup
          title="Snippets"
          :items="searchStore.results.snippets"
          variant="snippet"
          :active-global-index="-1"
          :start-index="0"
        />
        <SearchResultGroup
          title="AI Actions"
          :items="searchStore.results.aiActions"
          variant="aiAction"
          :active-global-index="-1"
          :start-index="searchStore.results.snippets.length"
        />
        <SearchResultGroup
          title="People"
          :items="searchStore.results.people"
          variant="person"
          :active-global-index="-1"
          :start-index="searchStore.results.snippets.length + searchStore.results.aiActions.length"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useSearchStore } from '@/stores/search';
import { useSearch } from '@/composables/useSearch';
import SearchResultGroup from '@/components/search/SearchResultGroup.vue';

const route = useRoute();
const router = useRouter();
const searchStore = useSearchStore();
const { search } = useSearch();

// ── Route query params ───────────────────────────────────────────────
const q = computed(() => {
  const val = route.query.q;
  return typeof val === 'string' && val.trim() !== '' ? val : '';
});

const typeFilter = computed(() => {
  const val = route.query.type;
  return typeof val === 'string' ? val : '';
});

const tagFilter = computed(() => {
  const val = route.query.tag;
  return typeof val === 'string' ? val : '';
});

const isFuzzy = computed(() => route.query.fuzzy === 'true');

// ── Derived state ────────────────────────────────────────────────────
const hasNoResults = computed(() => {
  const r = searchStore.results;
  if (r === null) return true;
  return r.snippets.length === 0 && r.aiActions.length === 0 && r.people.length === 0;
});

// ── Run search on mount + route changes ──────────────────────────────
watch(
  () => route.query,
  () => {
    if (q.value) {
      search(q.value);
    }
  },
  { immediate: true, deep: true },
);

// ── Filter actions ───────────────────────────────────────────────────
function removeFilter(filterKey: 'type' | 'tag'): void {
  const newQuery: Record<string, string> = {};
  if (q.value) newQuery.q = q.value;
  if (filterKey !== 'type' && typeFilter.value) newQuery.type = typeFilter.value;
  if (filterKey !== 'tag' && tagFilter.value) newQuery.tag = tagFilter.value;
  if (isFuzzy.value) newQuery.fuzzy = 'true';
  router.push({ path: '/search', query: newQuery });
}

function tryFuzzy(): void {
  const newQuery: Record<string, string> = {};
  if (q.value) newQuery.q = q.value;
  if (typeFilter.value) newQuery.type = typeFilter.value;
  if (tagFilter.value) newQuery.tag = tagFilter.value;
  newQuery.fuzzy = 'true';
  router.push({ path: '/search', query: newQuery });
}
</script>
