import type { Page, Locator } from '@playwright/test';

export const search = {
  // Existing
  searchInput: (page: Page): Locator => page.getByTestId('search-input'),
  searchResultItem: (page: Page): Locator => page.getByTestId('search-result-item').first(),

  // New for Issue #49 — top-bar trigger + SearchPage CTA
  searchTrigger: (page: Page): Locator => page.getByTestId('search-trigger'),
  openSearchCta: (page: Page): Locator => page.getByTestId('open-search-cta'),

  // SearchModal AI toggle + states (TheSearchModal.vue)
  aiToggle: (page: Page): Locator => page.getByTestId('ai-toggle'),
  searchPageLoading: (page: Page): Locator => page.getByTestId('search-page-loading'),
  tryFuzzyLink: (page: Page): Locator => page.getByTestId('try-fuzzy-link'),

  // Filter chips (SearchPage.vue) — chip + its remove button per facet
  filterChipType: (page: Page): Locator => page.getByTestId('filter-chip-type'),
  removeFilterType: (page: Page): Locator => page.getByTestId('remove-filter-type'),
  filterChipTag: (page: Page): Locator => page.getByTestId('filter-chip-tag'),
  removeFilterTag: (page: Page): Locator => page.getByTestId('remove-filter-tag'),
  filterChipAuthor: (page: Page): Locator => page.getByTestId('filter-chip-author'),
  removeFilterAuthor: (page: Page): Locator => page.getByTestId('remove-filter-author'),
  filterChipSince: (page: Page): Locator => page.getByTestId('filter-chip-since'),
  removeFilterSince: (page: Page): Locator => page.getByTestId('remove-filter-since'),

  // "Since" preset row (SearchPage.vue) — token-driven helper
  sincePreset: (page: Page, token: 'today' | '7d' | '30d' | 'all'): Locator =>
    page.getByTestId(`since-preset-${token}`),

  // Pagination (SearchPagination.vue)
  searchPagination: (page: Page): Locator => page.getByTestId('search-pagination'),
  prevPageBtn: (page: Page): Locator => page.getByTestId('prev-page-btn'),
  nextPageBtn: (page: Page): Locator => page.getByTestId('next-page-btn'),
  pageIndicator: (page: Page): Locator => page.getByTestId('page-indicator'),

  // Recent searches (TheSearchModal.vue empty-input state)
  recentSearches: (page: Page): Locator => page.getByTestId('recent-searches'),
  recentQuery: (page: Page): Locator => page.getByTestId('recent-query'),

  // Result item internals (SearchResultItem.vue)
  searchResultAuthor: (page: Page): Locator => page.getByTestId('search-result-author'),

  // SearchModal "see all results" CTA + chrome
  seeAllResults: (page: Page): Locator => page.getByTestId('see-all-results'),
  searchBackdrop: (page: Page): Locator => page.getByTestId('search-backdrop'),
  searchCloseBtn: (page: Page): Locator => page.getByTestId('search-close-btn'),
  searchLoading: (page: Page): Locator => page.getByTestId('search-loading'),
};
