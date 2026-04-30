import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

test('search: AI-toggle uses named mock script and triggers AI gate', async ({ testuser }) => {
  // Real impl gap (NOT in WU8c scope to fix):
  //
  //   SearchPage.vue mounts with ?ai=true in the route query, but
  //   useSearch.runSearch threads `ai` through `store.aiEnabled` (the
  //   modal toggle ref) — NOT through the route query. So navigating
  //   to /search?q=foo&ai=true never sends ai=true to /api/search,
  //   the AI gate never fires, and the URL is never rewritten with
  //   the resolved tag/type.
  //
  //   The intended UX (modal -> ai-toggle -> type -> see-all-results)
  //   also drops ai=true: seeAllResults() navigates with `{ q }` only.
  //
  //   Tracking: file a follow-up to thread route.query.ai through
  //   useSearch / buildSearchUrl on SearchPage. Until then, the only
  //   path that sends ai=true is the in-modal search after clicking
  //   the toggle. We assert THAT exercises the AI gate end-to-end —
  //   the request reaches /api/search with ai=true and the named
  //   mock script (search-resolves-to-typescript-tag) resolves to
  //   tags=['typescript'] inside the LangChain mock provider.
  //
  // The DoD bullet ("AI-toggle uses named mock script and returns
  // resolved results") is proved by:
  //   (1) the modal's ai-toggle flips store.aiEnabled,
  //   (2) the next /api/search request carries ai=true,
  //   (3) the response includes aiResolvedFilters.tag === 'typescript'
  //       (sourced from the named mock script).
  await withMockScript(testuser, 'search-resolves-to-typescript-tag');
  await testuser.goto('/');
  await search.searchTrigger(testuser).click();
  await expect(search.searchInput(testuser)).toBeVisible();
  await search.aiToggle(testuser).click();

  // Capture the /api/search response while typing the query.
  const searchRespP = testuser.waitForResponse(
    (r) => r.url().includes('/api/search?') && r.url().includes('ai=true'),
  );
  await search.searchInput(testuser).fill('foo');
  const resp = await searchRespP;
  const body = (await resp.json()) as { aiResolvedFilters?: { tag?: string } };
  expect(body.aiResolvedFilters?.tag).toBe('typescript');
});
