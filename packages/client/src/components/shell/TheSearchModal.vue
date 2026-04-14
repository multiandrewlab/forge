<template>
  <div
    v-if="searchStore.isOpen"
    data-testid="search-backdrop"
    class="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-[15vh]"
    @click="handleClose"
  >
    <div
      role="dialog"
      aria-modal="true"
      class="mx-4 flex w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-gray-900"
      @click.stop
      @keydown="onKeydown"
    >
      <!-- Search input row -->
      <div class="flex items-center gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <input
          ref="inputRef"
          v-model="inputValue"
          type="text"
          placeholder="Search snippets, people, actions..."
          class="flex-1 bg-transparent text-sm text-gray-900 placeholder-gray-400 outline-none dark:text-gray-100"
          @input="onInputChange"
        />
        <button
          data-testid="ai-toggle"
          :class="[
            'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors',
            aiEnabled
              ? 'bg-primary text-white'
              : 'bg-gray-100 text-gray-500 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700',
          ]"
          @click="handleAiToggle"
        >
          Ask AI
        </button>
        <button
          data-testid="search-close-btn"
          class="shrink-0 rounded p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
          aria-label="Close search"
          @click="handleClose"
        >
          <svg class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Results area -->
      <div class="max-h-[60vh] overflow-y-auto px-2 py-2">
        <!-- Loading state -->
        <div
          v-if="inputValue !== '' && searchStore.isLoading"
          data-testid="search-loading"
          class="px-3 py-4 text-center text-sm text-gray-500"
        >
          Searching...
        </div>

        <!-- Recent searches (empty input) -->
        <div v-else-if="inputValue === ''" data-testid="recent-searches">
          <h3
            v-if="searchStore.recentQueries.length > 0"
            class="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400"
          >
            Recent searches
          </h3>
          <button
            v-for="(rq, i) in searchStore.recentQueries"
            :key="i"
            data-testid="recent-query"
            class="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
            @click="selectRecent(rq)"
          >
            <svg
              class="h-4 w-4 shrink-0 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            {{ rq }}
          </button>
        </div>

        <!-- Result groups (non-empty input, not loading) -->
        <template v-else-if="searchStore.results">
          <SearchResultGroup
            title="Snippets"
            :items="searchStore.results.snippets"
            variant="snippet"
            :active-global-index="searchStore.activeIndex"
            :start-index="0"
            @select="handleSelect"
          />
          <SearchResultGroup
            title="AI Actions"
            :items="searchStore.results.aiActions"
            variant="aiAction"
            :active-global-index="searchStore.activeIndex"
            :start-index="snippetCount"
            @select="handleSelect"
          />
          <SearchResultGroup
            title="People"
            :items="searchStore.results.people"
            variant="person"
            :active-global-index="searchStore.activeIndex"
            :start-index="snippetCount + aiActionCount"
            @select="handleSelect"
          />
        </template>
      </div>

      <!-- "See all results" footer -->
      <div v-if="inputValue !== ''" class="border-t border-gray-200 dark:border-gray-700">
        <button
          data-testid="see-all-results"
          class="flex w-full items-center justify-center gap-1 px-4 py-2.5 text-sm text-primary hover:bg-gray-50 dark:hover:bg-gray-800"
          @click="seeAllResults"
        >
          See all results
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/* global document, HTMLElement, HTMLInputElement, Element, KeyboardEvent */
import { ref, computed, watch, nextTick } from 'vue';
import { useRouter } from 'vue-router';
import { useSearchStore } from '@/stores/search';
import { useSearch } from '@/composables/useSearch';
import SearchResultGroup from '@/components/search/SearchResultGroup.vue';
import type { SearchSnippet, UserSummary, AiAction } from '@forge/shared';

const router = useRouter();
const searchStore = useSearchStore();
const { search, aiEnabled, toggleAi } = useSearch();

const inputRef = ref<HTMLInputElement | null>(null);
const inputValue = ref('');
const previouslyFocused = ref<Element | null>(null);

// ── Computed counts ───────────────────────────────────────────────────

const snippetCount = computed(() => searchStore.results?.snippets.length ?? 0);
const aiActionCount = computed(() => searchStore.results?.aiActions.length ?? 0);
const peopleCount = computed(() => searchStore.results?.people.length ?? 0);
const totalCount = computed(() => snippetCount.value + aiActionCount.value + peopleCount.value);

// ── Auto-focus on open ────────────────────────────────────────────────

watch(
  () => searchStore.isOpen,
  async (isOpen) => {
    if (isOpen) {
      previouslyFocused.value = document.activeElement;
      await nextTick();
      inputRef.value?.focus();
    } else {
      inputValue.value = '';
      if (previouslyFocused.value && previouslyFocused.value instanceof HTMLElement) {
        previouslyFocused.value.focus();
      }
      previouslyFocused.value = null;
    }
  },
);

// ── Input handler ─────────────────────────────────────────────────────

function onInputChange(): void {
  search(inputValue.value);
}

// ── Close handler ─────────────────────────────────────────────────────

function handleClose(): void {
  searchStore.close();
}

// ── AI toggle handler ─────────────────────────────────────────────────

function handleAiToggle(): void {
  toggleAi();
  if (inputValue.value.trim() !== '') {
    search(inputValue.value);
  }
}

// ── Recent query click ────────────────────────────────────────────────

function selectRecent(q: string): void {
  inputValue.value = q;
  search(q);
}

// ── "See all results" ─────────────────────────────────────────────────

function seeAllResults(): void {
  router.push({ path: '/search', query: { q: inputValue.value } });
  searchStore.close();
}

// ── Resolve active item by global index ───────────────────────────────

interface ResolvedItem {
  variant: 'snippet' | 'aiAction' | 'person';
  data: SearchSnippet | AiAction | UserSummary;
}

function resolveItem(globalIndex: number): ResolvedItem | null {
  const results = searchStore.results;
  if (!results) return null;

  const sc = results.snippets.length;
  const ac = results.aiActions.length;

  if (globalIndex < sc) {
    return { variant: 'snippet', data: results.snippets[globalIndex] as SearchSnippet };
  }
  if (globalIndex < sc + ac) {
    return { variant: 'aiAction', data: results.aiActions[globalIndex - sc] as AiAction };
  }
  const personIdx = globalIndex - sc - ac;
  if (personIdx < results.people.length) {
    return { variant: 'person', data: results.people[personIdx] as UserSummary };
  }
  return null;
}

// ── Per-variant select ────────────────────────────────────────────────

function handleSelect(globalIndex: number): void {
  const resolved = resolveItem(globalIndex);
  if (!resolved) return;

  searchStore.pushRecent(inputValue.value);

  if (resolved.variant === 'snippet') {
    const snippet = resolved.data as SearchSnippet;
    router.push('/posts/' + snippet.id);
    searchStore.close();
  } else if (resolved.variant === 'person') {
    const person = resolved.data as UserSummary;
    searchStore.close();
    router.push({ path: '/search', query: { q: person.displayName } });
  } else {
    // aiAction — navigate to editor with pre-filled params
    const action = resolved.data as AiAction;
    searchStore.close();
    const params = action.params;
    const query: Record<string, string> = {};
    if (params.description) query.description = params.description;
    if (params.contentType) query.contentType = params.contentType;
    if (params.language) query.language = params.language;
    router.push({ path: '/posts/new', query });
  }
}

// ── Keyboard handler (scoped to dialog) ───────────────────────────────

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    handleClose();
    return;
  }

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (totalCount.value === 0) return;
    const next = (searchStore.activeIndex + 1) % totalCount.value;
    searchStore.setActiveIndex(next);
    return;
  }

  if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (totalCount.value === 0) return;
    const prev = (searchStore.activeIndex - 1 + totalCount.value) % totalCount.value;
    searchStore.setActiveIndex(prev);
    return;
  }

  if (e.key === 'Enter') {
    e.preventDefault();
    if (totalCount.value === 0) return;
    handleSelect(searchStore.activeIndex);
    return;
  }

  // ── Focus trap (dialog always has input + close button as focusables) ──
  if (e.key === 'Tab') {
    const dialog = e.currentTarget as HTMLElement;
    const focusables = Array.from(dialog.querySelectorAll<HTMLElement>('input, button, a[href]'));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (first && last) {
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }
}
</script>
