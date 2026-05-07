// e2e/fixtures/selectors/shell.ts
import type { Page, Locator } from '@playwright/test';

/**
 * Cross-cutting selectors used by the shell + accessibility specs (#52).
 *
 * Convention:
 *   - Interactive: kebab + role suffix (e.g. 'submit-btn').
 *   - Content/state: bare kebab nouns (e.g. 'error-message').
 *   - Selection always uses getByTestId; assertions on copy use toContainText.
 */
export const shell = {
  // ── Layout ─────────────────────────────────────────────────────────
  appLayout: (page: Page): Locator => page.getByTestId('app-layout'),
  topBar: (page: Page): Locator => page.getByTestId('top-bar'),
  sidebarDesktop: (page: Page): Locator => page.getByTestId('sidebar-desktop'),
  mobileNavDrawer: (page: Page): Locator => page.getByTestId('mobile-nav-drawer'),

  // ── Top bar elements ───────────────────────────────────────────────
  logoLink: (page: Page): Locator => page.getByTestId('logo-link'),
  searchTrigger: (page: Page): Locator => page.getByTestId('search-trigger'),
  darkModeToggle: (page: Page): Locator => page.getByTestId('dark-mode-toggle'),
  sidebarToggleBtn: (page: Page): Locator => page.getByTestId('sidebar-toggle-btn'),

  // ── Sidebar nav ────────────────────────────────────────────────────
  homeNavLink: (page: Page): Locator => page.getByTestId('home-nav-link'),
  trendingNavLink: (page: Page): Locator => page.getByTestId('trending-nav-link'),
  mySnippetsNavLink: (page: Page): Locator => page.getByTestId('my-snippets-nav-link'),
  bookmarksNavLink: (page: Page): Locator => page.getByTestId('bookmarks-nav-link'),
  followingNavLink: (page: Page): Locator => page.getByTestId('following-nav-link'),

  // ── User menu ──────────────────────────────────────────────────────
  userMenuTrigger: (page: Page): Locator => page.getByTestId('user-menu-trigger'),
  profileAction: (page: Page): Locator => page.getByTestId('profile-action'),
  mySnippetsAction: (page: Page): Locator => page.getByTestId('my-snippets-action'),
  settingsAction: (page: Page): Locator => page.getByTestId('settings-action'),
  logoutAction: (page: Page): Locator => page.getByTestId('logout-action'),

  // ── Search modal ───────────────────────────────────────────────────
  searchBackdrop: (page: Page): Locator => page.getByTestId('search-backdrop'),
  searchDialog: (page: Page): Locator => page.getByTestId('search-dialog'),
  searchInput: (page: Page): Locator => page.getByTestId('search-input'),
  searchCloseBtn: (page: Page): Locator => page.getByTestId('search-close-btn'),

  // ── Keyboard help ──────────────────────────────────────────────────
  keyboardShortcutsHelp: (page: Page): Locator => page.getByTestId('keyboard-shortcuts-help'),
  keyboardShortcutsHelpClose: (page: Page): Locator =>
    page.getByTestId('keyboard-shortcuts-help-close'),

  // ── Error toast ────────────────────────────────────────────────────
  errorToastStack: (page: Page): Locator => page.getByTestId('error-toast-stack'),
  errorToast: (page: Page): Locator => page.getByTestId('error-toast'),
  errorToastDismiss: (page: Page): Locator => page.getByTestId('error-toast-dismiss'),

  // ── Error boundary ─────────────────────────────────────────────────
  errorBoundaryFallback: (page: Page): Locator => page.getByTestId('error-boundary-fallback'),
  errorBoundaryRetry: (page: Page): Locator => page.getByTestId('error-boundary-retry'),

  // ── 404 ────────────────────────────────────────────────────────────
  notFoundPage: (page: Page): Locator => page.getByTestId('not-found-page'),
  notFoundBackHome: (page: Page): Locator => page.getByTestId('not-found-back-home'),

  // ── Breadcrumbs ────────────────────────────────────────────────────
  breadcrumbs: (page: Page): Locator => page.getByTestId('breadcrumbs'),
  breadcrumbCurrent: (page: Page): Locator => page.getByTestId('breadcrumb-current'),
  breadcrumbLink: (page: Page, idx: number): Locator => page.getByTestId(`breadcrumb-link-${idx}`),

  // ── Generic forbidden / not-permitted page (kept from prior shape) ─
  forbiddenPage: (page: Page): Locator => page.getByTestId('forbidden-page'),
};
