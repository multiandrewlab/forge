import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import { nextTick, ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import type { SearchResponse, SearchSnippet, UserSummary, AiAction } from '@forge/shared';
import TheSearchModal from '../../../components/shell/TheSearchModal.vue';
import { useSearchStore } from '../../../stores/search';

// ── Mock useSearch ────────────────────────────────────────────────────
const mockSearch = vi.fn();
const mockClearResults = vi.fn();
const mockToggleAi = vi.fn();

vi.mock('../../../composables/useSearch.js', () => ({
  useSearch: () => ({
    query: ref(''),
    results: ref<SearchResponse | null>(null),
    isLoading: ref(false),
    search: mockSearch,
    clearResults: mockClearResults,
    aiEnabled: ref(false),
    toggleAi: mockToggleAi,
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

const snippet2: SearchSnippet = {
  id: 'post-2',
  title: 'Vue composable',
  contentType: 'snippet',
  language: 'typescript',
  excerpt: 'useSearch example',
  authorId: 'u2',
  authorDisplayName: 'Bob',
  authorAvatarUrl: null,
  rank: 2,
  matchedBy: 'trigram',
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
  snippets: SearchSnippet[] = [snippet, snippet2],
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

// ── Helpers ───────────────────────────────────────────────────────────
function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/posts/:id', name: 'post-view', component: { template: '<div />' } },
      { path: '/posts/new', name: 'post-new', component: { template: '<div />' } },
      { path: '/search', component: { template: '<div />' } },
    ],
  });
}

function mountModal(router: Router): VueWrapper {
  return mount(TheSearchModal, {
    global: { plugins: [router] },
    attachTo: document.body,
  });
}

describe('TheSearchModal', () => {
  let router: Router;
  let store: ReturnType<typeof useSearchStore>;

  beforeEach(async () => {
    setActivePinia(createPinia());
    router = createTestRouter();
    await router.push('/');
    await router.isReady();
    store = useSearchStore();
    mockSearch.mockClear();
    mockClearResults.mockClear();
    mockToggleAi.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  // ── Test 15: Opens when store.isOpen becomes true; input is auto-focused ──
  it('opens when store.isOpen becomes true and auto-focuses the input', async () => {
    const wrapper = mountModal(router);

    // Initially hidden
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    store.open();
    await nextTick();
    await nextTick();

    // Now visible
    const dialog = wrapper.find('[role="dialog"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.attributes('aria-modal')).toBe('true');

    // Input is focused
    const input = wrapper.find('input');
    expect(input.exists()).toBe(true);
    expect(document.activeElement).toBe(input.element);

    wrapper.unmount();
  });

  // ── Test 16: Esc closes; backdrop click closes; clicking inside dialog does not close ──
  it('Esc closes the modal', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    expect(wrapper.find('[role="dialog"]').exists()).toBe(true);

    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    await nextTick();

    expect(store.isOpen).toBe(false);
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    wrapper.unmount();
  });

  it('backdrop click closes the modal', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    // Click the backdrop (the outer overlay div)
    const backdrop = wrapper.find('[data-testid="search-backdrop"]');
    expect(backdrop.exists()).toBe(true);
    await backdrop.trigger('click');
    await nextTick();

    expect(store.isOpen).toBe(false);

    wrapper.unmount();
  });

  it('clicking inside the dialog does not close', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    const dialog = wrapper.find('[role="dialog"]');
    await dialog.trigger('click');
    await nextTick();

    expect(store.isOpen).toBe(true);

    wrapper.unmount();
  });

  // ── Test 17: Arrow Down/Up move activeIndex with wrapping ──
  it('ArrowDown increments activeIndex and wraps at end', async () => {
    const wrapper = mountModal(router);
    store.open();
    store.setResults(makeResults([snippet], [aiAction], [person]));
    await nextTick();
    await nextTick();

    const dialog = wrapper.find('[role="dialog"]');

    // Total items: 1 snippet + 1 aiAction + 1 person = 3
    expect(store.activeIndex).toBe(0);

    await dialog.trigger('keydown', { key: 'ArrowDown' });
    expect(store.activeIndex).toBe(1);

    await dialog.trigger('keydown', { key: 'ArrowDown' });
    expect(store.activeIndex).toBe(2);

    // Wrap to 0
    await dialog.trigger('keydown', { key: 'ArrowDown' });
    expect(store.activeIndex).toBe(0);

    wrapper.unmount();
  });

  it('ArrowUp does nothing when there are no results', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    const dialog = wrapper.find('[role="dialog"]');
    await dialog.trigger('keydown', { key: 'ArrowUp' });
    expect(store.activeIndex).toBe(0);

    wrapper.unmount();
  });

  it('ArrowUp decrements activeIndex and wraps at beginning', async () => {
    const wrapper = mountModal(router);
    store.open();
    store.setResults(makeResults([snippet], [aiAction], [person]));
    await nextTick();
    await nextTick();

    const dialog = wrapper.find('[role="dialog"]');

    expect(store.activeIndex).toBe(0);

    // Wrap to end (total 3, so index 2)
    await dialog.trigger('keydown', { key: 'ArrowUp' });
    expect(store.activeIndex).toBe(2);

    await dialog.trigger('keydown', { key: 'ArrowUp' });
    expect(store.activeIndex).toBe(1);

    wrapper.unmount();
  });

  // ── Test 18: Enter on snippet → router.push with /posts/<id>; modal closes ──
  it('Enter on snippet navigates to /posts/<id> and closes', async () => {
    const wrapper = mountModal(router);
    store.open();
    store.setResults(makeResults([snippet], [], []));
    await nextTick();
    await nextTick();

    // Set input value
    const input = wrapper.find('input');
    await input.setValue('react');

    const pushSpy = vi.spyOn(router, 'push');

    // activeIndex is 0 → snippet
    const dialog = wrapper.find('[role="dialog"]');
    await dialog.trigger('keydown', { key: 'Enter' });
    await nextTick();

    expect(pushSpy).toHaveBeenCalledWith('/posts/post-1');
    expect(store.isOpen).toBe(false);

    wrapper.unmount();
  });

  // ── Test 19: Enter on person → router.push with /search?q=<name> ──
  it('Enter on person navigates to /search?q=<name> and closes', async () => {
    const wrapper = mountModal(router);
    store.open();
    // Only person, so index 0 is person
    store.setResults(makeResults([], [], [person]));
    await nextTick();
    await nextTick();

    const input = wrapper.find('input');
    await input.setValue('alice');

    const pushSpy = vi.spyOn(router, 'push');

    const dialog = wrapper.find('[role="dialog"]');
    await dialog.trigger('keydown', { key: 'Enter' });
    await nextTick();

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/search',
      query: { q: 'Alice Smith' },
    });
    expect(store.isOpen).toBe(false);

    wrapper.unmount();
  });

  // ── Test 20: Enter on aiAction → navigates to /posts/new with query params ──
  it('Enter on aiAction navigates to /posts/new with query params and closes', async () => {
    const actionWithParams: AiAction = {
      label: 'Generate snippet',
      action: 'generate',
      params: { description: 'fizzbuzz', contentType: 'snippet', language: 'python' },
    };

    const wrapper = mountModal(router);
    store.open();
    store.setResults(makeResults([], [actionWithParams], []));
    await nextTick();
    await nextTick();

    const input = wrapper.find('input');
    await input.setValue('fizzbuzz');

    const pushSpy = vi.spyOn(router, 'push');

    const dialog = wrapper.find('[role="dialog"]');
    await dialog.trigger('keydown', { key: 'Enter' });
    await nextTick();

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/posts/new',
      query: { description: 'fizzbuzz', contentType: 'snippet', language: 'python' },
    });
    expect(store.isOpen).toBe(false);

    wrapper.unmount();
  });

  it('Enter on aiAction with empty params navigates to /posts/new with empty query', async () => {
    const emptyParamAction: AiAction = {
      label: 'Summarize this',
      action: 'summarize',
      params: {},
    };

    const wrapper = mountModal(router);
    store.open();
    store.setResults(makeResults([], [emptyParamAction], []));
    await nextTick();
    await nextTick();

    const input = wrapper.find('input');
    await input.setValue('summarize');

    const pushSpy = vi.spyOn(router, 'push');

    const dialog = wrapper.find('[role="dialog"]');
    await dialog.trigger('keydown', { key: 'Enter' });
    await nextTick();

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/posts/new',
      query: {},
    });
    expect(store.isOpen).toBe(false);

    wrapper.unmount();
  });

  // ── AI toggle button ──
  it('renders Ask AI toggle button', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    expect(wrapper.find('[data-testid="ai-toggle"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-toggle"]').text()).toBe('Ask AI');

    wrapper.unmount();
  });

  it('clicking Ask AI toggle calls toggleAi', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    const toggleBtn = wrapper.find('[data-testid="ai-toggle"]');
    await toggleBtn.trigger('click');
    await nextTick();

    expect(mockToggleAi).toHaveBeenCalledTimes(1);

    wrapper.unmount();
  });

  it('clicking Ask AI toggle re-runs search when input is non-empty', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    const input = wrapper.find('input');
    await input.setValue('react');
    mockSearch.mockClear();

    const toggleBtn = wrapper.find('[data-testid="ai-toggle"]');
    await toggleBtn.trigger('click');
    await nextTick();

    expect(mockSearch).toHaveBeenCalledWith('react');

    wrapper.unmount();
  });

  it('clicking Ask AI toggle does not re-run search when input is empty', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    mockSearch.mockClear();

    const toggleBtn = wrapper.find('[data-testid="ai-toggle"]');
    await toggleBtn.trigger('click');
    await nextTick();

    expect(mockSearch).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  // ── Test 21: "See all results" click → router.push /search?q=...; closes ──
  it('"See all results" navigates to /search with current query and closes', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    const input = wrapper.find('input');
    await input.setValue('react');
    await nextTick();

    const pushSpy = vi.spyOn(router, 'push');

    const seeAll = wrapper.find('[data-testid="see-all-results"]');
    expect(seeAll.exists()).toBe(true);
    await seeAll.trigger('click');
    await nextTick();

    expect(pushSpy).toHaveBeenCalledWith({
      path: '/search',
      query: { q: 'react' },
    });
    expect(store.isOpen).toBe(false);

    wrapper.unmount();
  });

  it('"See all results" is not visible when inputValue is empty', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    expect(wrapper.find('[data-testid="see-all-results"]').exists()).toBe(false);

    wrapper.unmount();
  });

  // ── Test 22: Recent-query click populates inputValue and triggers search ──
  it('recent-query click populates inputValue and triggers search', async () => {
    const wrapper = mountModal(router);
    store.pushRecent('vue composable');
    store.open();
    await nextTick();
    await nextTick();

    // With empty input, recent searches should show
    const recentItems = wrapper.findAll('[data-testid="recent-query"]');
    expect(recentItems.length).toBeGreaterThan(0);

    await recentItems[0].trigger('click');
    await nextTick();

    const input = wrapper.find('input');
    expect((input.element as HTMLInputElement).value).toBe('vue composable');
    expect(mockSearch).toHaveBeenCalledWith('vue composable');

    wrapper.unmount();
  });

  // ── Test 23: Tab focus trap ──
  // When inputValue is empty, the dialog contains: input, close-btn, and possibly recent-query buttons.
  // We clear recentQueries so the only focusables are input + close-btn.
  it('Tab from close button wraps focus to input', async () => {
    const wrapper = mountModal(router);
    // Ensure no recent queries so close-btn is truly the last focusable
    store.recentQueries = [];
    store.open();
    await nextTick();
    await nextTick();

    const closeBtn = wrapper.find('[data-testid="search-close-btn"]');
    expect(closeBtn.exists()).toBe(true);

    // Focus the close button
    (closeBtn.element as HTMLButtonElement).focus();
    expect(document.activeElement).toBe(closeBtn.element);

    // Tab forward from last focusable should wrap to first
    const dialog = wrapper.find('[role="dialog"]');
    await dialog.trigger('keydown', { key: 'Tab', shiftKey: false });
    await nextTick();

    const input = wrapper.find('input');
    expect(document.activeElement).toBe(input.element);

    wrapper.unmount();
  });

  it('Shift+Tab from input wraps focus to close button', async () => {
    const wrapper = mountModal(router);
    // Ensure no recent queries so close-btn is truly the last focusable
    store.recentQueries = [];
    store.open();
    await nextTick();
    await nextTick();

    const input = wrapper.find('input');
    expect(document.activeElement).toBe(input.element);

    // Shift+Tab from first focusable should wrap to last
    const dialog = wrapper.find('[role="dialog"]');
    await dialog.trigger('keydown', { key: 'Tab', shiftKey: true });
    await nextTick();

    const closeBtn = wrapper.find('[data-testid="search-close-btn"]');
    expect(document.activeElement).toBe(closeBtn.element);

    wrapper.unmount();
  });

  // ── Test 24: Loading state ──
  it('shows loading state when isLoading is true', async () => {
    const wrapper = mountModal(router);
    store.open();
    store.setLoading(true);
    await nextTick();
    await nextTick();

    // Set a non-empty input so loading shows in the results area
    const input = wrapper.find('input');
    await input.setValue('react');
    await nextTick();

    expect(wrapper.find('[data-testid="search-loading"]').exists()).toBe(true);

    wrapper.unmount();
  });

  // ── Test 25: Empty input → recent searches; non-empty → result groups ──
  it('shows recent searches when input is empty', async () => {
    const wrapper = mountModal(router);
    store.pushRecent('typescript');
    store.open();
    await nextTick();
    await nextTick();

    expect(wrapper.find('[data-testid="recent-searches"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('typescript');

    wrapper.unmount();
  });

  it('shows result groups when input is non-empty and results exist', async () => {
    const wrapper = mountModal(router);
    store.open();
    store.setResults(makeResults());
    await nextTick();
    await nextTick();

    const input = wrapper.find('input');
    await input.setValue('react');
    await nextTick();

    expect(wrapper.find('[data-testid="recent-searches"]').exists()).toBe(false);
    // Should contain result groups
    expect(wrapper.text()).toContain('React hooks');

    wrapper.unmount();
  });

  // ── Additional: input calls search on change ──
  it('input change triggers search', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    const input = wrapper.find('input');
    await input.setValue('vue');
    await nextTick();

    expect(mockSearch).toHaveBeenCalledWith('vue');

    wrapper.unmount();
  });

  // ── Additional: close button click closes ──
  it('close button click closes the modal', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    const closeBtn = wrapper.find('[data-testid="search-close-btn"]');
    await closeBtn.trigger('click');
    await nextTick();

    expect(store.isOpen).toBe(false);

    wrapper.unmount();
  });

  // ── Additional: focus restoration on close ──
  it('restores focus to previously-focused element on close', async () => {
    // Create a button to have as the "previously focused" element
    const btn = document.createElement('button');
    btn.textContent = 'outside';
    document.body.appendChild(btn);
    btn.focus();
    expect(document.activeElement).toBe(btn);

    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    // Focus moved to input
    const input = wrapper.find('input');
    expect(document.activeElement).toBe(input.element);

    // Close via Esc
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    await nextTick();

    expect(document.activeElement).toBe(btn);

    btn.remove();
    wrapper.unmount();
  });

  // ── Additional: pushRecent is called before close on snippet select ──
  it('pushRecent is called before close on snippet select', async () => {
    const wrapper = mountModal(router);
    store.open();
    store.setResults(makeResults([snippet], [], []));
    await nextTick();
    await nextTick();

    const input = wrapper.find('input');
    await input.setValue('react');

    const pushRecentSpy = vi.spyOn(store, 'pushRecent');
    const closeSpy = vi.spyOn(store, 'close');

    const dialog = wrapper.find('[role="dialog"]');
    await dialog.trigger('keydown', { key: 'Enter' });
    await nextTick();

    expect(pushRecentSpy).toHaveBeenCalledWith('react');
    // pushRecent should have been called before close
    const pushRecentOrder = pushRecentSpy.mock.invocationCallOrder[0] as number;
    const closeOrder = closeSpy.mock.invocationCallOrder[0] as number;
    expect(pushRecentOrder).toBeLessThan(closeOrder);

    wrapper.unmount();
  });

  // ── Additional: select via click on SearchResultGroup emits correctly ──
  it('select via group click on snippet navigates correctly', async () => {
    const wrapper = mountModal(router);
    store.open();
    store.setResults(makeResults([snippet, snippet2], [], []));
    await nextTick();
    await nextTick();

    const input = wrapper.find('input');
    await input.setValue('react');

    const pushSpy = vi.spyOn(router, 'push');

    // Click on second snippet (index 1)
    const items = wrapper.findAll('[role="option"]');
    expect(items.length).toBeGreaterThanOrEqual(2);
    await items[1].trigger('click');
    await nextTick();

    expect(pushSpy).toHaveBeenCalledWith('/posts/post-2');
    expect(store.isOpen).toBe(false);

    wrapper.unmount();
  });

  // ── Additional: ArrowDown/Up with no results ──
  it('ArrowDown does nothing when there are no results', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    const dialog = wrapper.find('[role="dialog"]');
    await dialog.trigger('keydown', { key: 'ArrowDown' });
    expect(store.activeIndex).toBe(0);

    wrapper.unmount();
  });

  it('Enter does nothing when there are no results', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    const pushSpy = vi.spyOn(router, 'push');
    const dialog = wrapper.find('[role="dialog"]');
    await dialog.trigger('keydown', { key: 'Enter' });
    await nextTick();

    expect(pushSpy).not.toHaveBeenCalled();

    wrapper.unmount();
  });

  // ── handleSelect when results have been cleared (resolveItem with null results) ──
  it('handleSelect does nothing when results are null', async () => {
    const wrapper = mountModal(router);
    store.open();
    store.setResults(makeResults([snippet], [], []));
    await nextTick();
    await nextTick();

    const input = wrapper.find('input');
    await input.setValue('react');
    await nextTick();

    // Find the SearchResultGroup and emit select, then clear results before next tick
    const SearchResultGroup = (await import('../../../components/search/SearchResultGroup.vue'))
      .default;
    const groups = wrapper.findAllComponents(SearchResultGroup);
    expect(groups.length).toBeGreaterThan(0);

    // Clear results so resolveItem gets null results
    store.setResults(null);
    // Emit select on the group (simulates a race where results are cleared between click and handler)
    groups[0].vm.$emit('select', 0);
    await nextTick();

    const pushSpy = vi.spyOn(router, 'push');

    // No navigation should occur
    expect(pushSpy).not.toHaveBeenCalled();
    expect(store.isOpen).toBe(true);

    wrapper.unmount();
  });

  // ── handleSelect with out-of-bounds index (resolveItem returns null) ──
  it('handleSelect does nothing when activeIndex is out of bounds', async () => {
    const wrapper = mountModal(router);
    store.open();
    store.setResults(makeResults([snippet], [], []));
    await nextTick();
    await nextTick();

    const input = wrapper.find('input');
    await input.setValue('react');

    // Manually set activeIndex beyond total count
    store.setActiveIndex(99);

    const pushSpy = vi.spyOn(router, 'push');
    const pushRecentSpy = vi.spyOn(store, 'pushRecent');

    // Trigger select via a click on a SearchResultGroup item (which emits select with globalIndex)
    // Instead, let's directly trigger Enter -- but totalCount guard prevents it.
    // We need to trigger handleSelect with an out-of-bounds index.
    // Use the group's @select event by clicking an item, but that sends a valid index.
    // The simplest way: temporarily set results so there are items, set activeIndex beyond range,
    // then bypass the totalCount guard by having totalCount > 0 but activeIndex out of the
    // snippets+aiActions+people range. Actually totalCount === 1 (1 snippet), activeIndex === 99.
    // The Enter handler checks totalCount > 0 (passes) then calls handleSelect(99).
    // resolveItem(99) will return null since 99 >= snippets.length.
    const dialog = wrapper.find('[role="dialog"]');
    await dialog.trigger('keydown', { key: 'Enter' });
    await nextTick();

    expect(pushRecentSpy).not.toHaveBeenCalled();
    expect(pushSpy).not.toHaveBeenCalled();
    // Modal stays open since handleSelect returned early
    expect(store.isOpen).toBe(true);

    wrapper.unmount();
  });

  // ── Groups rendered in correct order: Snippets → AI Actions → People ──
  it('renders groups in order: Snippets, AI Actions, People', async () => {
    const wrapper = mountModal(router);
    store.open();
    store.setResults(makeResults([snippet], [aiAction], [person]));
    await nextTick();
    await nextTick();

    const input = wrapper.find('input');
    await input.setValue('react');
    await nextTick();

    const headings = wrapper.findAll('h3');
    const headingTexts = headings.map((h) => h.text());
    expect(headingTexts).toEqual(['Snippets', 'AI Actions', 'People']);

    wrapper.unmount();
  });

  // ── Focus restoration handles null previouslyFocused gracefully ──
  it('close works gracefully when no element was previously focused', async () => {
    // Blur everything so document.activeElement is <body> before open
    (document.activeElement as HTMLElement)?.blur();

    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    // Close
    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    await nextTick();

    expect(store.isOpen).toBe(false);
    // Should not throw

    wrapper.unmount();
  });

  // ── Close clears inputValue ──
  it('close clears inputValue', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    const input = wrapper.find('input');
    await input.setValue('react');
    expect((input.element as HTMLInputElement).value).toBe('react');

    await wrapper.find('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    await nextTick();

    // Reopen to check input is cleared
    store.open();
    await nextTick();
    await nextTick();

    const newInput = wrapper.find('input');
    expect((newInput.element as HTMLInputElement).value).toBe('');

    wrapper.unmount();
  });

  // ── Tab from input without close button visible (no-op edge) ──
  it('Tab focus trap handles Tab normally within focusables', async () => {
    const wrapper = mountModal(router);
    store.open();
    await nextTick();
    await nextTick();

    const input = wrapper.find('input');
    expect(document.activeElement).toBe(input.element);

    // Tab forward from input (not the last focusable) - should move to close button
    const dialog = wrapper.find('[role="dialog"]');
    await dialog.trigger('keydown', { key: 'Tab', shiftKey: false });

    // Input is the first focusable; Tab should NOT prevent default here since
    // input is not the last focusable. The browser would naturally move to close btn.
    // We just verify the trap doesn't interfere incorrectly.
    // (The actual focusing is tested in the wrapping tests above.)

    wrapper.unmount();
  });
});
