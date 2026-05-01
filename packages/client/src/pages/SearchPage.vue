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

      <!-- Since-preset row (issue #49): Today / 7d / 30d / All time -->
      <div data-testid="since-preset-row" class="mb-3 flex flex-wrap gap-2">
        <button
          data-testid="since-preset-today"
          type="button"
          :class="presetClass('today')"
          @click="setSincePreset('today')"
        >
          Today
        </button>
        <button
          data-testid="since-preset-7d"
          type="button"
          :class="presetClass('7d')"
          @click="setSincePreset('7d')"
        >
          7d
        </button>
        <button
          data-testid="since-preset-30d"
          type="button"
          :class="presetClass('30d')"
          @click="setSincePreset('30d')"
        >
          30d
        </button>
        <button
          data-testid="since-preset-all"
          type="button"
          :class="presetClass(null)"
          @click="setSincePreset(null)"
        >
          All time
        </button>
      </div>

      <!-- Filter chips -->
      <div
        v-if="typeFilter || tagFilter || authorFilter || sinceFilter"
        class="mb-4 flex flex-wrap gap-2"
      >
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
        <span
          v-if="authorFilter"
          data-testid="filter-chip-author"
          class="inline-flex items-center gap-1 rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-200"
        >
          author: {{ authorFilter }}
          <button
            data-testid="remove-filter-author"
            class="ml-1 text-gray-400 hover:text-white"
            aria-label="Remove author filter"
            @click="removeFilter('author')"
          >
            &times;
          </button>
        </span>
        <span
          v-if="sinceFilter"
          data-testid="filter-chip-since"
          class="inline-flex items-center gap-1 rounded-full bg-gray-700 px-3 py-1 text-xs text-gray-200"
        >
          since: {{ sinceFilter }}
          <button
            data-testid="remove-filter-since"
            class="ml-1 text-gray-400 hover:text-white"
            aria-label="Remove since filter"
            @click="removeFilter('since')"
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

      <template v-else>
        <!--
          No results banner: shown when there are no real-content matches
          (snippets + people). AI Actions still render below so the user
          has a fallback path even on a no-match query.
        -->
        <div v-if="hasNoResults" class="py-12 text-center">
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

        <!-- Result groups (render whenever results exist) -->
        <div v-if="searchStore.results">
          <SearchResultGroup
            title="Snippets"
            :items="searchStore.results.snippets"
            variant="snippet"
            :active-global-index="-1"
            :start-index="0"
            @select="onSelect"
            @add-author-filter="addAuthorFilter"
          />
          <SearchResultGroup
            title="AI Actions"
            :items="searchStore.results.aiActions"
            variant="aiAction"
            :active-global-index="-1"
            :start-index="searchStore.results.snippets.length"
            @select="onSelect"
            @add-author-filter="addAuthorFilter"
          />
          <SearchResultGroup
            title="People"
            :items="searchStore.results.people"
            variant="person"
            :active-global-index="-1"
            :start-index="
              searchStore.results.snippets.length + searchStore.results.aiActions.length
            "
            @select="onSelect"
            @add-author-filter="addAuthorFilter"
          />

          <!-- Pagination (issue #49) -->
          <SearchPagination
            :page="searchStore.page"
            :total-pages="searchStore.totalPages"
            @change="setPage"
          />
        </div>
      </template>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { useRoute, useRouter, type LocationQueryRaw } from 'vue-router';
import type { SearchSnippet, UserSummary, AiAction } from '@forge/shared';
import { useSearchStore } from '@/stores/search';
import { useSearch, type SearchParams } from '@/composables/useSearch';
import SearchResultGroup from '@/components/search/SearchResultGroup.vue';
import SearchPagination from '@/components/search/SearchPagination.vue';

const route = useRoute();
const router = useRouter();
const searchStore = useSearchStore();
const { runSearch } = useSearch();

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

const authorFilter = computed(() => {
  const val = route.query.author;
  return typeof val === 'string' ? val : '';
});

const sinceFilter = computed(() => {
  const val = route.query.since;
  return typeof val === 'string' ? val : '';
});

const isFuzzy = computed(() => route.query.fuzzy === 'true');
const isAi = computed(() => route.query.ai === 'true');

const pageParam = computed(() => {
  const val = route.query.page;
  if (typeof val !== 'string') return 1;
  const parsed = parseInt(val, 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : 1;
});

// ── Derived state ────────────────────────────────────────────────────
//
// "No results" is keyed on real content matches (snippets + people).
// AI Actions are synthesized from the query itself (e.g. "Generate a
// foo tutorial") and are present even for nonsense queries — counting
// them as "results" would suppress the try-fuzzy-link affordance,
// which is the whole point of the no-results state.
const hasNoResults = computed(() => {
  const r = searchStore.results;
  if (r === null) return true;
  return r.snippets.length === 0 && r.people.length === 0;
});

// ── Helpers ─────────────────────────────────────────────────────────
function buildOpts(): SearchParams {
  const opts: SearchParams = {};
  if (typeFilter.value) opts.type = typeFilter.value;
  if (tagFilter.value) opts.tag = tagFilter.value;
  if (isFuzzy.value) opts.fuzzy = true;
  if (isAi.value) opts.ai = true;
  if (authorFilter.value) opts.author = authorFilter.value;
  if (sinceFilter.value) opts.since = sinceFilter.value;
  if (pageParam.value > 1) opts.page = pageParam.value;
  return opts;
}

function presetClass(token: string | null): string {
  const base = 'rounded-full px-3 py-1 text-xs border';
  const isActive = token === null ? sinceFilter.value === '' : sinceFilter.value === token;
  return isActive
    ? `${base} border-primary bg-primary/20 text-primary`
    : `${base} border-gray-700 text-gray-300 hover:bg-gray-700`;
}

// ── Run search on mount + route changes ──────────────────────────────
//
// When the server returns aiResolvedFilters (AI-assisted search), we need to
// merge those into the route query AND drop ai=true so subsequent navigations
// (pagination, filter clicks) don't re-trigger the AI path. router.replace
// keeps the back-button behaviour sane.
async function runWithRewrite(): Promise<void> {
  await runSearch(q.value, buildOpts());
  const resolved = searchStore.results?.aiResolvedFilters;
  if (resolved && isAi.value) {
    const newQuery: LocationQueryRaw = { ...route.query };
    delete newQuery.ai;
    if (resolved.tag) newQuery.tag = resolved.tag;
    if (resolved.type) newQuery.type = resolved.type;
    void router.replace({ path: '/search', query: newQuery });
  }
}

watch(
  () => route.query,
  () => {
    if (q.value) {
      void runWithRewrite();
    }
  },
  { immediate: true, deep: true },
);

// ── Filter actions ───────────────────────────────────────────────────
function removeFilter(filterKey: 'type' | 'tag' | 'author' | 'since'): void {
  const newQuery: Record<string, string> = {};
  if (q.value) newQuery.q = q.value;
  if (filterKey !== 'type' && typeFilter.value) newQuery.type = typeFilter.value;
  if (filterKey !== 'tag' && tagFilter.value) newQuery.tag = tagFilter.value;
  if (filterKey !== 'author' && authorFilter.value) newQuery.author = authorFilter.value;
  if (filterKey !== 'since' && sinceFilter.value) newQuery.since = sinceFilter.value;
  if (isFuzzy.value) newQuery.fuzzy = 'true';
  void router.push({ path: '/search', query: newQuery });
}

function tryFuzzy(): void {
  const newQuery: Record<string, string> = {};
  if (q.value) newQuery.q = q.value;
  if (typeFilter.value) newQuery.type = typeFilter.value;
  if (tagFilter.value) newQuery.tag = tagFilter.value;
  if (authorFilter.value) newQuery.author = authorFilter.value;
  if (sinceFilter.value) newQuery.since = sinceFilter.value;
  newQuery.fuzzy = 'true';
  void router.push({ path: '/search', query: newQuery });
}

function setSincePreset(token: string | null): void {
  const newQuery: Record<string, string> = {};
  if (q.value) newQuery.q = q.value;
  if (typeFilter.value) newQuery.type = typeFilter.value;
  if (tagFilter.value) newQuery.tag = tagFilter.value;
  if (authorFilter.value) newQuery.author = authorFilter.value;
  if (isFuzzy.value) newQuery.fuzzy = 'true';
  if (token !== null) newQuery.since = token;
  void router.push({ path: '/search', query: newQuery });
}

function setPage(n: number): void {
  const newQuery: Record<string, string> = {};
  if (q.value) newQuery.q = q.value;
  if (typeFilter.value) newQuery.type = typeFilter.value;
  if (tagFilter.value) newQuery.tag = tagFilter.value;
  if (authorFilter.value) newQuery.author = authorFilter.value;
  if (sinceFilter.value) newQuery.since = sinceFilter.value;
  if (isFuzzy.value) newQuery.fuzzy = 'true';
  if (n > 1) newQuery.page = String(n);
  void router.push({ path: '/search', query: newQuery });
}

// ── Result selection (Issue #49) ─────────────────────────────────────
//
// Mirrors TheSearchModal.handleSelect: SearchResultGroup emits a global index
// across the three lists (snippets, aiActions, people, in that order). We
// resolve the index back to an item and route accordingly.
function onSelect(globalIndex: number): void {
  const r = searchStore.results;
  if (!r) return;

  const sc = r.snippets.length;
  const ac = r.aiActions.length;

  if (globalIndex < sc) {
    const snippet = r.snippets[globalIndex] as SearchSnippet;
    void router.push('/posts/' + snippet.id);
    return;
  }

  if (globalIndex < sc + ac) {
    const action = r.aiActions[globalIndex - sc] as AiAction;
    const params = action.params;
    const query: Record<string, string> = {};
    if (params.description) query.description = params.description;
    if (params.contentType) query.contentType = params.contentType;
    if (params.language) query.language = params.language;
    void router.push({ path: '/posts/new', query });
    return;
  }

  const personIdx = globalIndex - sc - ac;
  if (personIdx < r.people.length) {
    const person = r.people[personIdx] as UserSummary;
    void router.push({ path: '/search', query: { q: person.displayName } });
  }
}

// Expose for testing: covers the `if (!r) return;` early-return guard which
// the template never reaches (the result groups only render when results is
// truthy via v-else-if="searchStore.results").
defineExpose({ onSelect });

function addAuthorFilter(displayName: string): void {
  const newQuery: Record<string, string> = {};
  if (q.value) newQuery.q = q.value;
  if (typeFilter.value) newQuery.type = typeFilter.value;
  if (tagFilter.value) newQuery.tag = tagFilter.value;
  if (sinceFilter.value) newQuery.since = sinceFilter.value;
  if (isFuzzy.value) newQuery.fuzzy = 'true';
  newQuery.author = displayName;
  void router.push({ path: '/search', query: newQuery });
}
</script>
