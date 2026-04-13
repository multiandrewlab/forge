import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import type { SearchResponse, SearchSnippet, UserSummary, AiAction } from '@forge/shared';
import { useSearchStore } from '../../stores/search';

// ── Mock useSearch ────────────────────────────────────────────────────
const mockSearch = vi.fn();
const mockClearResults = vi.fn();

vi.mock('../../composables/useSearch.js', () => ({
  useSearch: () => ({
    query: ref(''),
    results: ref<SearchResponse | null>(null),
    isLoading: ref(false),
    search: mockSearch,
    clearResults: mockClearResults,
  }),
}));

// ── Test data ─────────────────────────────────────────────────────────
const snippet: SearchSnippet = {
  id: 'post-1',
  title: 'React hooks',
  contentType: 'snippet',
  language: 'typescript',
  excerpt: 'useEffect example',
  authorId: 'u1',
  authorDisplayName: 'Alice',
  authorAvatarUrl: null,
  rank: 1,
  matchedBy: 'tsvector',
};

const person: UserSummary = {
  id: 'u1',
  displayName: 'Alice Smith',
  avatarUrl: null,
  postCount: 5,
};

const aiAction: AiAction = {
  label: 'Summarize this',
  action: 'summarize',
  params: {},
};

function makeResults(
  snippets: SearchSnippet[] = [snippet],
  aiActions: AiAction[] = [aiAction],
  people: UserSummary[] = [person],
): SearchResponse {
  return {
    snippets,
    aiActions,
    people,
    query: 'react',
    totalResults: snippets.length + aiActions.length + people.length,
  };
}

import SearchPage from '../../pages/SearchPage.vue';

// ── Helpers ───────────────────────────────────────────────────────────
function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/search', name: 'search', component: SearchPage },
    ],
  });
}

describe('SearchPage.vue', () => {
  let router: Router;
  let store: ReturnType<typeof useSearchStore>;

  beforeEach(async () => {
    setActivePinia(createPinia());
    router = createTestRouter();
    await router.push('/search');
    await router.isReady();
    store = useSearchStore();
    mockSearch.mockClear();
    mockClearResults.mockClear();
  });

  // ── DoD #1: Reads q from route.query, calls search on mount ──
  it('calls search(q) on mount when route has q param', async () => {
    await router.push({ path: '/search', query: { q: 'react' } });
    await router.isReady();

    mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(mockSearch).toHaveBeenCalledWith('react');
  });

  // ── DoD #1: Watches route.query changes ──
  it('calls search again when route query changes', async () => {
    await router.push({ path: '/search', query: { q: 'react' } });
    await router.isReady();

    mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();
    mockSearch.mockClear();

    await router.push({ path: '/search', query: { q: 'vue' } });
    await flushPromises();

    expect(mockSearch).toHaveBeenCalledWith('vue');
  });

  // ── DoD #2: Header shows "Results for {q}" ──
  it('shows "Results for {q}" header when q is present', async () => {
    await router.push({ path: '/search', query: { q: 'react' } });
    await router.isReady();

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('Results for');
    expect(wrapper.text()).toContain('react');
  });

  // ── DoD #3: Filter chips for type ──
  it('renders a type filter chip when type is in route.query', async () => {
    await router.push({ path: '/search', query: { q: 'react', type: 'snippet' } });
    await router.isReady();

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    const chip = wrapper.find('[data-testid="filter-chip-type"]');
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain('snippet');
  });

  it('removes type filter when chip X is clicked', async () => {
    await router.push({ path: '/search', query: { q: 'react', type: 'snippet' } });
    await router.isReady();

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    const pushSpy = vi.spyOn(router, 'push');
    const removeBtn = wrapper.find('[data-testid="remove-filter-type"]');
    expect(removeBtn.exists()).toBe(true);
    await removeBtn.trigger('click');

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/search',
      query: { q: 'react' },
    });
  });

  // ── DoD #3: Filter chips for tag ──
  it('renders a tag filter chip when tag is in route.query', async () => {
    await router.push({ path: '/search', query: { q: 'react', tag: 'javascript' } });
    await router.isReady();

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    const chip = wrapper.find('[data-testid="filter-chip-tag"]');
    expect(chip.exists()).toBe(true);
    expect(chip.text()).toContain('javascript');
  });

  it('removes tag filter when chip X is clicked', async () => {
    await router.push({ path: '/search', query: { q: 'react', tag: 'javascript' } });
    await router.isReady();

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    const pushSpy = vi.spyOn(router, 'push');
    const removeBtn = wrapper.find('[data-testid="remove-filter-tag"]');
    expect(removeBtn.exists()).toBe(true);
    await removeBtn.trigger('click');

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/search',
      query: { q: 'react' },
    });
  });

  // ── DoD #4: Renders three SearchResultGroup sections ──
  it('renders Snippets, AI Actions, and People result groups', async () => {
    await router.push({ path: '/search', query: { q: 'react' } });
    await router.isReady();

    store.setResults(makeResults());

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    const headings = wrapper.findAll('h3');
    const texts = headings.map((h) => h.text());
    expect(texts).toContain('Snippets');
    expect(texts).toContain('AI Actions');
    expect(texts).toContain('People');
  });

  // ── DoD #5: Empty q → "Start typing to search" + CTA ──
  it('shows empty-state copy when q is missing', async () => {
    await router.push({ path: '/search' });
    await router.isReady();

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('Start typing to search');
  });

  it('shows CTA button that calls searchStore.open() when q is missing', async () => {
    await router.push({ path: '/search' });
    await router.isReady();

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    const openSpy = vi.spyOn(store, 'open');
    const ctaBtn = wrapper.find('[data-testid="open-search-cta"]');
    expect(ctaBtn.exists()).toBe(true);
    await ctaBtn.trigger('click');
    expect(openSpy).toHaveBeenCalled();
  });

  // ── DoD #6: Loading state ──
  it('shows loading state when isLoading is true', async () => {
    await router.push({ path: '/search', query: { q: 'react' } });
    await router.isReady();

    store.setLoading(true);

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="search-page-loading"]').exists()).toBe(true);
  });

  // ── DoD #7: No-results state ──
  it('shows "No results" state when q is present but results are empty', async () => {
    await router.push({ path: '/search', query: { q: 'xyznotfound' } });
    await router.isReady();

    store.setResults(makeResults([], [], []));

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('No results for');
    expect(wrapper.text()).toContain('xyznotfound');
  });

  it('shows "Try fuzzy search" link when not already fuzzy', async () => {
    await router.push({ path: '/search', query: { q: 'xyznotfound' } });
    await router.isReady();

    store.setResults(makeResults([], [], []));

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    const fuzzyLink = wrapper.find('[data-testid="try-fuzzy-link"]');
    expect(fuzzyLink.exists()).toBe(true);
  });

  // ── DoD #8: Try fuzzy toggles ?fuzzy=true ──
  it('"Try fuzzy search" link adds fuzzy=true to route', async () => {
    await router.push({ path: '/search', query: { q: 'xyznotfound' } });
    await router.isReady();

    store.setResults(makeResults([], [], []));

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    const pushSpy = vi.spyOn(router, 'push');
    const fuzzyLink = wrapper.find('[data-testid="try-fuzzy-link"]');
    await fuzzyLink.trigger('click');

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/search',
      query: { q: 'xyznotfound', fuzzy: 'true' },
    });
  });

  it('does not show "Try fuzzy search" link when already fuzzy', async () => {
    await router.push({ path: '/search', query: { q: 'xyznotfound', fuzzy: 'true' } });
    await router.isReady();

    store.setResults(makeResults([], [], []));

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="try-fuzzy-link"]').exists()).toBe(false);
  });

  // ── DoD #7: No results when totalResults is 0 ──
  it('shows "No results" when results object exists but totalResults is 0', async () => {
    await router.push({ path: '/search', query: { q: 'empty' } });
    await router.isReady();

    store.setResults({
      snippets: [],
      aiActions: [],
      people: [],
      query: 'empty',
      totalResults: 0,
    });

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('No results for');
  });

  // ── Does not call search when q is empty ──
  it('does not call search when q is empty string', async () => {
    await router.push({ path: '/search', query: { q: '' } });
    await router.isReady();

    mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(mockSearch).not.toHaveBeenCalled();
  });

  // ── Results but not loading, not empty — shows groups (not loading, not empty state) ──
  it('does not show loading state when not loading', async () => {
    await router.push({ path: '/search', query: { q: 'react' } });
    await router.isReady();

    store.setLoading(false);
    store.setResults(makeResults());

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="search-page-loading"]').exists()).toBe(false);
  });

  // ── No results state not shown when results have items ──
  it('does not show "No results" when results have items', async () => {
    await router.push({ path: '/search', query: { q: 'react' } });
    await router.isReady();

    store.setResults(makeResults());

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).not.toContain('No results for');
  });

  // ── Filter chips not rendered when not in query ──
  it('does not render filter chips when no type/tag in query', async () => {
    await router.push({ path: '/search', query: { q: 'react' } });
    await router.isReady();

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="filter-chip-type"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="filter-chip-tag"]').exists()).toBe(false);
  });

  // ── Both type and tag filter chips at same time ──
  it('renders both type and tag filter chips when both in query', async () => {
    await router.push({
      path: '/search',
      query: { q: 'react', type: 'snippet', tag: 'javascript' },
    });
    await router.isReady();

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="filter-chip-type"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="filter-chip-tag"]').exists()).toBe(true);
  });

  // ── Removing tag filter preserves type filter ──
  it('removing tag filter preserves type filter', async () => {
    await router.push({
      path: '/search',
      query: { q: 'react', type: 'snippet', tag: 'javascript' },
    });
    await router.isReady();

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    const pushSpy = vi.spyOn(router, 'push');
    const removeBtn = wrapper.find('[data-testid="remove-filter-tag"]');
    await removeBtn.trigger('click');

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/search',
      query: { q: 'react', type: 'snippet' },
    });
  });

  // ── Removing type filter preserves tag filter ──
  it('removing type filter preserves tag filter', async () => {
    await router.push({
      path: '/search',
      query: { q: 'react', type: 'snippet', tag: 'javascript' },
    });
    await router.isReady();

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    const pushSpy = vi.spyOn(router, 'push');
    const removeBtn = wrapper.find('[data-testid="remove-filter-type"]');
    await removeBtn.trigger('click');

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/search',
      query: { q: 'react', tag: 'javascript' },
    });
  });

  // ── Empty state does not show header or no-results ──
  it('empty state does not show "Results for" header', async () => {
    await router.push({ path: '/search' });
    await router.isReady();

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).not.toContain('Results for');
    expect(wrapper.text()).not.toContain('No results for');
  });

  // ── Results are null, q is present, not loading → shows no-results ──
  it('shows no-results when q is present but results are null and not loading', async () => {
    await router.push({ path: '/search', query: { q: 'test' } });
    await router.isReady();

    store.setResults(null);
    store.setLoading(false);

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('No results for');
  });

  // ── fuzzy param is preserved when removing filters ──
  it('preserves fuzzy param when removing type filter', async () => {
    await router.push({
      path: '/search',
      query: { q: 'react', type: 'snippet', fuzzy: 'true' },
    });
    await router.isReady();

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    const pushSpy = vi.spyOn(router, 'push');
    const removeBtn = wrapper.find('[data-testid="remove-filter-type"]');
    await removeBtn.trigger('click');

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/search',
      query: { q: 'react', fuzzy: 'true' },
    });
  });

  // ── DoD #7: hasNoResults returns false when isLoading is true ──
  it('does not show no-results when loading (hasNoResults isLoading branch)', async () => {
    await router.push({ path: '/search', query: { q: 'react' } });
    await router.isReady();

    store.setLoading(true);
    store.setResults(null);

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    // Should show loading, NOT no-results
    expect(wrapper.find('[data-testid="search-page-loading"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('No results for');
  });

  // ── tryFuzzy preserves type and tag filters ──
  it('"Try fuzzy search" preserves type and tag filters in URL', async () => {
    await router.push({
      path: '/search',
      query: { q: 'xyznotfound', type: 'snippet', tag: 'javascript' },
    });
    await router.isReady();

    store.setResults(makeResults([], [], []));

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    const pushSpy = vi.spyOn(router, 'push');
    const fuzzyLink = wrapper.find('[data-testid="try-fuzzy-link"]');
    await fuzzyLink.trigger('click');

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/search',
      query: { q: 'xyznotfound', type: 'snippet', tag: 'javascript', fuzzy: 'true' },
    });
  });

  // ── tryFuzzy with only type filter ──
  it('"Try fuzzy search" preserves only type filter when no tag', async () => {
    await router.push({
      path: '/search',
      query: { q: 'xyznotfound', type: 'snippet' },
    });
    await router.isReady();

    store.setResults(makeResults([], [], []));

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    const pushSpy = vi.spyOn(router, 'push');
    const fuzzyLink = wrapper.find('[data-testid="try-fuzzy-link"]');
    await fuzzyLink.trigger('click');

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/search',
      query: { q: 'xyznotfound', type: 'snippet', fuzzy: 'true' },
    });
  });

  // ── tryFuzzy with only tag filter ──
  it('"Try fuzzy search" preserves only tag filter when no type', async () => {
    await router.push({
      path: '/search',
      query: { q: 'xyznotfound', tag: 'javascript' },
    });
    await router.isReady();

    store.setResults(makeResults([], [], []));

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    const pushSpy = vi.spyOn(router, 'push');
    const fuzzyLink = wrapper.find('[data-testid="try-fuzzy-link"]');
    await fuzzyLink.trigger('click');

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/search',
      query: { q: 'xyznotfound', tag: 'javascript', fuzzy: 'true' },
    });
  });

  // ── Route query watch fires search with new params ──
  it('calls search when fuzzy param is added via route change', async () => {
    await router.push({ path: '/search', query: { q: 'react' } });
    await router.isReady();

    mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();
    mockSearch.mockClear();

    await router.push({ path: '/search', query: { q: 'react', fuzzy: 'true' } });
    await flushPromises();

    expect(mockSearch).toHaveBeenCalledWith('react');
  });
});
