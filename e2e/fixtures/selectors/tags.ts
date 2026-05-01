import type { Page, Locator } from '@playwright/test';

export const tags = {
  // Sidebar — Popular Tags section (TheSidebar.vue)
  popularTagsList: (page: Page): Locator => page.getByTestId('popular-tags-list'),
  popularTagRow: (page: Page, name: string): Locator => page.getByTestId(`popular-tag-row-${name}`),

  // Per-row subscribe button + error (TagSubscribeButton.vue)
  subscribeBtn: (page: Page, name: string): Locator => page.getByTestId(`subscribe-btn-${name}`),
  subscribeError: (page: Page, name: string): Locator =>
    page.getByTestId(`subscribe-error-${name}`),

  // Tag page (TagPage.vue) — loading / not-found / loaded / empty states
  tagPage: (page: Page): Locator => page.getByTestId('tag-page'),
  tagPageTitle: (page: Page): Locator => page.getByTestId('tag-page-title'),
  tagPageLoading: (page: Page): Locator => page.getByTestId('tag-page-loading'),
  tagPageEmpty: (page: Page): Locator => page.getByTestId('tag-page-empty'),
  tagNotFound: (page: Page): Locator => page.getByTestId('tag-not-found'),

  // Sidebar — Following nav link (TheSidebar.vue navLinks)
  followingNavLink: (page: Page): Locator => page.getByTestId('following-nav-link'),

  // NOTE: `subscribed-tag-link-${name}` is NOT yet rendered in TheSidebar.vue.
  // The "Followed Tags" section currently uses unkeyed <button @click="handleTagClick">
  // entries. Specs that need to click into a subscribed tag from the sidebar must
  // either rely on visible text (`page.getByRole('button', { name: '#${name}' })`)
  // or a downstream WU must add this testid. Helper kept here for forward-compat
  // so specs can import it now and the DOM can catch up.
  subscribedTagLink: (page: Page, name: string): Locator =>
    page.getByTestId(`subscribed-tag-link-${name}`),

  // Tag chip on PostMetaHeader.vue / PostViewPage.vue (also exported from posts.ts;
  // duplicated here so tags-domain specs can stay in this shard).
  postTagChip: (page: Page, name: string): Locator => page.getByTestId(`post-tag-chip-${name}`),
};
