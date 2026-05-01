import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import type { SearchResponse, SearchSnippet, UserSummary, AiAction } from '@forge/shared';
import { useSearchStore } from '../../stores/search';

// ── Mock useSearch ────────────────────────────────────────────────────
// SearchPage uses `runSearch` (awaitable, non-debounced) — so the mock
// here is wired to `runSearch` even though the assertion variable name
// `mockSearch` is preserved for spec readability.
const mockSearch = vi.fn();
const mockClearResults = vi.fn();

vi.mock('../../composables/useSearch.js', () => ({
  useSearch: () => ({
    query: ref(''),
    results: ref<SearchResponse | null>(null),
    isLoading: ref(false),
    search: mockSearch,
    runSearch: mockSearch,
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
  overrides: Partial<SearchResponse> = {},
): SearchResponse {
  return {
    snippets,
    aiActions,
    people,
    query: 'react',
    totalResults: snippets.length + aiActions.length + people.length,
    page: 1,
    totalPages: 1,
    ...overrides,
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
      { path: '/posts/new', name: 'post-new', component: { template: '<div />' } },
      { path: '/posts/:id', name: 'post-view', component: { template: '<div />' } },
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

    expect(mockSearch).toHaveBeenCalled();
    expect(mockSearch.mock.calls[0][0]).toBe('react');
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

    expect(mockSearch).toHaveBeenCalled();
    expect(mockSearch.mock.calls[0][0]).toBe('vue');
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

  // ── hasNoResults ignores aiActions (synthesized from query) ──
  it('shows "Try fuzzy search" link even when aiActions is non-empty (snippets + people are empty)', async () => {
    await router.push({ path: '/search', query: { q: 'xyznotfound' } });
    await router.isReady();

    // Server populates aiActions for ANY query — they should not count as
    // "results" for the no-results / try-fuzzy-link gate.
    store.setResults(makeResults([], [aiAction], []));

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="try-fuzzy-link"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('No results for');
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
      page: 1,
      totalPages: 1,
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

    expect(mockSearch).toHaveBeenCalled();
    expect(mockSearch.mock.calls[0][0]).toBe('react');
    // Verify fuzzy is forwarded as opts.fuzzy
    expect(mockSearch.mock.calls[0][1]).toEqual({ fuzzy: true });
  });

  // ── Issue #49: ?ai=true threads through buildOpts ─────────────────
  it('forwards ai=true from route.query.ai into search opts', async () => {
    await router.push({ path: '/search', query: { q: 'foo', ai: 'true' } });
    await router.isReady();

    mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(mockSearch).toHaveBeenCalled();
    expect(mockSearch.mock.calls[0][0]).toBe('foo');
    expect(mockSearch.mock.calls[0][1]).toEqual(expect.objectContaining({ ai: true }));
  });

  // ── Issue #49: filter-chip-author ─────────────────────────────────
  describe('author filter chip', () => {
    it('renders filter-chip-author when author is in route.query', async () => {
      await router.push({ path: '/search', query: { q: 'react', author: 'Alice' } });
      await router.isReady();

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const chip = wrapper.find('[data-testid="filter-chip-author"]');
      expect(chip.exists()).toBe(true);
      expect(chip.text()).toContain('Alice');
    });

    it('removes author filter when X is clicked', async () => {
      await router.push({ path: '/search', query: { q: 'react', author: 'Alice' } });
      await router.isReady();

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const pushSpy = vi.spyOn(router, 'push');
      const removeBtn = wrapper.find('[data-testid="remove-filter-author"]');
      await removeBtn.trigger('click');

      expect(pushSpy).toHaveBeenCalledWith({
        path: '/search',
        query: { q: 'react' },
      });
    });

    it('forwards author to search opts', async () => {
      await router.push({ path: '/search', query: { q: 'react', author: 'Alice' } });
      await router.isReady();

      mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      expect(mockSearch.mock.calls[0][1]).toEqual({ author: 'Alice' });
    });

    it('preserves since filter when removing author filter', async () => {
      await router.push({
        path: '/search',
        query: { q: 'react', author: 'Alice', since: '7d' },
      });
      await router.isReady();

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const pushSpy = vi.spyOn(router, 'push');
      await wrapper.find('[data-testid="remove-filter-author"]').trigger('click');

      expect(pushSpy).toHaveBeenCalledWith({
        path: '/search',
        query: { q: 'react', since: '7d' },
      });
    });
  });

  // ── Issue #49: filter-chip-since ──────────────────────────────────
  describe('since filter chip', () => {
    it('renders filter-chip-since when since is in route.query', async () => {
      await router.push({ path: '/search', query: { q: 'react', since: '7d' } });
      await router.isReady();

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const chip = wrapper.find('[data-testid="filter-chip-since"]');
      expect(chip.exists()).toBe(true);
      expect(chip.text()).toContain('7d');
    });

    it('removes since filter when X is clicked', async () => {
      await router.push({ path: '/search', query: { q: 'react', since: '7d' } });
      await router.isReady();

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const pushSpy = vi.spyOn(router, 'push');
      const removeBtn = wrapper.find('[data-testid="remove-filter-since"]');
      await removeBtn.trigger('click');

      expect(pushSpy).toHaveBeenCalledWith({
        path: '/search',
        query: { q: 'react' },
      });
    });

    it('forwards since to search opts', async () => {
      await router.push({ path: '/search', query: { q: 'react', since: '30d' } });
      await router.isReady();

      mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      expect(mockSearch.mock.calls[0][1]).toEqual({ since: '30d' });
    });

    it('preserves author filter when removing since filter', async () => {
      await router.push({
        path: '/search',
        query: { q: 'react', author: 'Alice', since: '7d' },
      });
      await router.isReady();

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const pushSpy = vi.spyOn(router, 'push');
      await wrapper.find('[data-testid="remove-filter-since"]').trigger('click');

      expect(pushSpy).toHaveBeenCalledWith({
        path: '/search',
        query: { q: 'react', author: 'Alice' },
      });
    });
  });

  // ── Issue #49: since-preset row ───────────────────────────────────
  describe('since-preset row', () => {
    it('renders 4 preset chips', async () => {
      await router.push({ path: '/search', query: { q: 'react' } });
      await router.isReady();

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      expect(wrapper.find('[data-testid="since-preset-today"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="since-preset-7d"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="since-preset-30d"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="since-preset-all"]').exists()).toBe(true);
    });

    it('clicking Today pushes ?since=today', async () => {
      await router.push({ path: '/search', query: { q: 'react' } });
      await router.isReady();

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const pushSpy = vi.spyOn(router, 'push');
      await wrapper.find('[data-testid="since-preset-today"]').trigger('click');

      expect(pushSpy).toHaveBeenCalledWith({
        path: '/search',
        query: { q: 'react', since: 'today' },
      });
    });

    it('clicking 7d pushes ?since=7d', async () => {
      await router.push({ path: '/search', query: { q: 'react' } });
      await router.isReady();

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const pushSpy = vi.spyOn(router, 'push');
      await wrapper.find('[data-testid="since-preset-7d"]').trigger('click');

      expect(pushSpy).toHaveBeenCalledWith({
        path: '/search',
        query: { q: 'react', since: '7d' },
      });
    });

    it('clicking 30d pushes ?since=30d', async () => {
      await router.push({ path: '/search', query: { q: 'react' } });
      await router.isReady();

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const pushSpy = vi.spyOn(router, 'push');
      await wrapper.find('[data-testid="since-preset-30d"]').trigger('click');

      expect(pushSpy).toHaveBeenCalledWith({
        path: '/search',
        query: { q: 'react', since: '30d' },
      });
    });

    it('clicking All time omits since param', async () => {
      await router.push({ path: '/search', query: { q: 'react', since: '7d' } });
      await router.isReady();

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const pushSpy = vi.spyOn(router, 'push');
      await wrapper.find('[data-testid="since-preset-all"]').trigger('click');

      expect(pushSpy).toHaveBeenCalledWith({
        path: '/search',
        query: { q: 'react' },
      });
    });

    it('preserves type, tag, fuzzy, author when picking a since preset', async () => {
      await router.push({
        path: '/search',
        query: { q: 'react', type: 'snippet', tag: 'js', fuzzy: 'true', author: 'Alice' },
      });
      await router.isReady();

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const pushSpy = vi.spyOn(router, 'push');
      await wrapper.find('[data-testid="since-preset-7d"]').trigger('click');

      expect(pushSpy).toHaveBeenCalledWith({
        path: '/search',
        query: {
          q: 'react',
          type: 'snippet',
          tag: 'js',
          fuzzy: 'true',
          author: 'Alice',
          since: '7d',
        },
      });
    });
  });

  // ── Issue #49: <SearchPagination> ─────────────────────────────────
  describe('SearchPagination', () => {
    it('renders SearchPagination when totalPages > 1', async () => {
      await router.push({ path: '/search', query: { q: 'react' } });
      await router.isReady();

      store.setResults(makeResults([snippet], [], [], { page: 1, totalPages: 3 }));

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      expect(wrapper.find('[data-testid="search-pagination"]').exists()).toBe(true);
    });

    it('clicking Next pushes ?page=2', async () => {
      await router.push({ path: '/search', query: { q: 'react' } });
      await router.isReady();

      store.setResults(makeResults([snippet], [], [], { page: 1, totalPages: 3 }));

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const pushSpy = vi.spyOn(router, 'push');
      await wrapper.find('[data-testid="next-page-btn"]').trigger('click');

      expect(pushSpy).toHaveBeenCalledWith({
        path: '/search',
        query: { q: 'react', page: '2' },
      });
    });

    it('forwards page param to search opts when > 1', async () => {
      await router.push({ path: '/search', query: { q: 'react', page: '2' } });
      await router.isReady();

      mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      expect(mockSearch.mock.calls[0][1]).toEqual({ page: 2 });
    });

    it('does not forward page param when === 1', async () => {
      await router.push({ path: '/search', query: { q: 'react', page: '1' } });
      await router.isReady();

      mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      expect(mockSearch.mock.calls[0][1]).toEqual({});
    });

    it('does not forward page param when not provided', async () => {
      await router.push({ path: '/search', query: { q: 'react' } });
      await router.isReady();

      mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      expect(mockSearch.mock.calls[0][1]).toEqual({});
    });

    it('treats invalid page param as 1 (no forwarding)', async () => {
      await router.push({ path: '/search', query: { q: 'react', page: 'abc' } });
      await router.isReady();

      mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      expect(mockSearch.mock.calls[0][1]).toEqual({});
    });

    it('preserves filters when navigating to a new page', async () => {
      await router.push({
        path: '/search',
        query: { q: 'react', type: 'snippet', tag: 'js', author: 'Alice', since: '7d' },
      });
      await router.isReady();

      store.setResults(makeResults([snippet], [], [], { page: 1, totalPages: 3 }));

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const pushSpy = vi.spyOn(router, 'push');
      await wrapper.find('[data-testid="next-page-btn"]').trigger('click');

      expect(pushSpy).toHaveBeenCalledWith({
        path: '/search',
        query: {
          q: 'react',
          type: 'snippet',
          tag: 'js',
          author: 'Alice',
          since: '7d',
          page: '2',
        },
      });
    });

    it('drops page param when navigating back to page 1', async () => {
      // Pagination shows current=2, click Prev → page 1 → query has no page param
      await router.push({ path: '/search', query: { q: 'react', page: '2' } });
      await router.isReady();

      store.setResults(makeResults([snippet], [], [], { page: 2, totalPages: 5 }));

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const pushSpy = vi.spyOn(router, 'push');
      await wrapper.find('[data-testid="prev-page-btn"]').trigger('click');

      expect(pushSpy).toHaveBeenCalledWith({
        path: '/search',
        query: { q: 'react' },
      });
    });
  });

  // ── Issue #49: addAuthorFilter from result item ───────────────────
  describe('addAuthorFilter event', () => {
    it('clicking a result author button pushes ?author=<name>', async () => {
      await router.push({ path: '/search', query: { q: 'react' } });
      await router.isReady();

      store.setResults(makeResults([snippet], [], []));

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const pushSpy = vi.spyOn(router, 'push');
      const authorBtn = wrapper.find('[data-testid="search-result-author"]');
      expect(authorBtn.exists()).toBe(true);
      await authorBtn.trigger('click');

      expect(pushSpy).toHaveBeenCalledWith({
        path: '/search',
        query: { q: 'react', author: 'Alice' },
      });
    });

    it('preserves type, tag, since, fuzzy when adding author filter', async () => {
      await router.push({
        path: '/search',
        query: { q: 'react', type: 'snippet', tag: 'js', since: '7d', fuzzy: 'true' },
      });
      await router.isReady();

      store.setResults(makeResults([snippet], [], []));

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const pushSpy = vi.spyOn(router, 'push');
      await wrapper.find('[data-testid="search-result-author"]').trigger('click');

      expect(pushSpy).toHaveBeenCalledWith({
        path: '/search',
        query: {
          q: 'react',
          type: 'snippet',
          tag: 'js',
          since: '7d',
          fuzzy: 'true',
          author: 'Alice',
        },
      });
    });
  });

  // ── Issue #49: aiResolvedFilters URL rewrite ──────────────────────
  describe('aiResolvedFilters URL rewrite', () => {
    it('replaces route with resolved filters and removes ai=true after AI search', async () => {
      await router.push({ path: '/search', query: { q: 'foo bar', ai: 'true' } });
      await router.isReady();

      // Simulate the server returning aiResolvedFilters in the response.
      mockSearch.mockImplementationOnce(async () => {
        store.setResults(
          makeResults([snippet], [], [], {
            aiResolvedFilters: { tag: 'frontend', type: 'snippet' },
          }),
        );
      });

      const replaceSpy = vi.spyOn(router, 'replace');
      mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      expect(replaceSpy).toHaveBeenCalledWith({
        path: '/search',
        query: expect.objectContaining({
          q: 'foo bar',
          tag: 'frontend',
          type: 'snippet',
        }),
      });
      const lastCall = replaceSpy.mock.calls[replaceSpy.mock.calls.length - 1][0];
      const lastQuery = (lastCall as { query: Record<string, string> }).query;
      expect(lastQuery.ai).toBeUndefined();
    });

    it('does not call router.replace when no aiResolvedFilters in response', async () => {
      await router.push({ path: '/search', query: { q: 'foo', ai: 'true' } });
      await router.isReady();

      mockSearch.mockImplementationOnce(async () => {
        store.setResults(makeResults([snippet], [], []));
      });

      const replaceSpy = vi.spyOn(router, 'replace');
      mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      expect(replaceSpy).not.toHaveBeenCalled();
    });

    it('does not call router.replace when ai is not true', async () => {
      await router.push({ path: '/search', query: { q: 'foo' } });
      await router.isReady();

      mockSearch.mockImplementationOnce(async () => {
        store.setResults(
          makeResults([snippet], [], [], {
            aiResolvedFilters: { tag: 'frontend' },
          }),
        );
      });

      const replaceSpy = vi.spyOn(router, 'replace');
      mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      expect(replaceSpy).not.toHaveBeenCalled();
    });
  });

  // ── Issue #49: tryFuzzy preserves all filters ─────────────────────
  it('"Try fuzzy search" preserves author and since filters', async () => {
    await router.push({
      path: '/search',
      query: { q: 'xyznotfound', author: 'Bob', since: '7d' },
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
      query: { q: 'xyznotfound', author: 'Bob', since: '7d', fuzzy: 'true' },
    });
  });

  // ── Issue #49: setPage preserves fuzzy when paginating ─────────────
  it('paginating preserves fuzzy=true', async () => {
    await router.push({
      path: '/search',
      query: { q: 'react', fuzzy: 'true' },
    });
    await router.isReady();

    store.setResults(makeResults([snippet], [], [], { page: 1, totalPages: 3 }));

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    const pushSpy = vi.spyOn(router, 'push');
    await wrapper.find('[data-testid="next-page-btn"]').trigger('click');

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/search',
      query: { q: 'react', fuzzy: 'true', page: '2' },
    });
  });

  // ── Issue #49: filter chip group renders when any of the four is set ──
  it('renders the chip group when only author is set', async () => {
    await router.push({ path: '/search', query: { q: 'react', author: 'Bob' } });
    await router.isReady();

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="filter-chip-author"]').exists()).toBe(true);
  });

  it('renders the chip group when only since is set', async () => {
    await router.push({ path: '/search', query: { q: 'react', since: 'today' } });
    await router.isReady();

    const wrapper = mount(SearchPage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="filter-chip-since"]').exists()).toBe(true);
  });

  // ── Issue #49: clicking a search result navigates to the right destination ──
  describe('result click navigation (Issue #49)', () => {
    it('navigates to /posts/:id when a snippet result is selected', async () => {
      await router.push({ path: '/search', query: { q: 'react' } });
      await router.isReady();

      store.setResults(makeResults());

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const groups = wrapper.findAllComponents({ name: 'SearchResultGroup' });
      // Snippets group is first; emit select with global index 0 (the snippet)
      const snippetsGroup = groups[0];
      if (!snippetsGroup) throw new Error('Snippets group not found');
      snippetsGroup.vm.$emit('select', 0);
      await flushPromises();

      expect(router.currentRoute.value.path).toBe('/posts/post-1');
    });

    it('navigates to /search?q=<displayName> when a person result is selected', async () => {
      await router.push({ path: '/search', query: { q: 'react' } });
      await router.isReady();

      store.setResults(makeResults());

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const groups = wrapper.findAllComponents({ name: 'SearchResultGroup' });
      // People group is third; global index = snippets(1) + aiActions(1) = 2
      const peopleGroup = groups[2];
      if (!peopleGroup) throw new Error('People group not found');
      peopleGroup.vm.$emit('select', 2);
      await flushPromises();

      expect(router.currentRoute.value.path).toBe('/search');
      expect(router.currentRoute.value.query.q).toBe('Alice Smith');
    });

    it('navigates to /posts/new with prefilled params when an aiAction is selected', async () => {
      await router.push({ path: '/search', query: { q: 'react' } });
      await router.isReady();

      const filledAction: AiAction = {
        label: 'Generate snippet',
        action: 'generate',
        params: {
          description: 'A useEffect example',
          contentType: 'snippet',
          language: 'typescript',
        },
      };
      store.setResults(makeResults([snippet], [filledAction], [person]));

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const groups = wrapper.findAllComponents({ name: 'SearchResultGroup' });
      // AI Actions group is second; global index = snippets(1) = 1
      const aiActionsGroup = groups[1];
      if (!aiActionsGroup) throw new Error('AI Actions group not found');
      aiActionsGroup.vm.$emit('select', 1);
      await flushPromises();

      expect(router.currentRoute.value.path).toBe('/posts/new');
      expect(router.currentRoute.value.query.description).toBe('A useEffect example');
      expect(router.currentRoute.value.query.contentType).toBe('snippet');
      expect(router.currentRoute.value.query.language).toBe('typescript');
    });

    it('navigates to /posts/new without query params when aiAction has empty params', async () => {
      await router.push({ path: '/search', query: { q: 'react' } });
      await router.isReady();

      // aiAction fixture above has empty params
      store.setResults(makeResults());

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const groups = wrapper.findAllComponents({ name: 'SearchResultGroup' });
      const aiActionsGroup = groups[1];
      if (!aiActionsGroup) throw new Error('AI Actions group not found');
      aiActionsGroup.vm.$emit('select', 1);
      await flushPromises();

      expect(router.currentRoute.value.path).toBe('/posts/new');
      expect(router.currentRoute.value.query.description).toBeUndefined();
      expect(router.currentRoute.value.query.contentType).toBeUndefined();
      expect(router.currentRoute.value.query.language).toBeUndefined();
    });

    it('does nothing when results is null (early-return guard)', async () => {
      await router.push({ path: '/search', query: { q: 'react' } });
      await router.isReady();

      // results stays null (no setResults call). The template never renders a
      // SearchResultGroup in that state, so we exercise the guard directly via
      // the component's exposed onSelect handler.
      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const exposed = wrapper.vm as unknown as { onSelect: (i: number) => void };
      exposed.onSelect(0);
      await flushPromises();

      expect(router.currentRoute.value.path).toBe('/search');
    });

    it('does nothing when global index is out of range', async () => {
      await router.push({ path: '/search', query: { q: 'react' } });
      await router.isReady();

      store.setResults(makeResults());

      const wrapper = mount(SearchPage, { global: { plugins: [router] } });
      await flushPromises();

      const groups = wrapper.findAllComponents({ name: 'SearchResultGroup' });
      // Out-of-range index — past the end of all three lists
      const snippetsGroup = groups[0];
      if (!snippetsGroup) throw new Error('Snippets group not found');
      snippetsGroup.vm.$emit('select', 999);
      await flushPromises();

      // Route did not change away from /search
      expect(router.currentRoute.value.path).toBe('/search');
    });
  });
});
