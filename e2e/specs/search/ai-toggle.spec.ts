import { test, expect } from '../../fixtures/reset.js';
import { search } from '../../fixtures/selectors/search.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

test('search: AI-toggle uses named mock script and returns resolved results', async ({
  testuser,
}) => {
  // Direct URL nav exercises the AI page-1 gate end-to-end:
  //   (1) SearchPage threads route.query.ai through buildOpts(),
  //   (2) useSearch.runSearch honors opts.ai (overrides store toggle),
  //   (3) /api/search receives ai=true and the named mock script
  //       resolves to tags=['typescript'] inside the LangChain mock,
  //   (4) the client merges aiResolvedFilters and rewrites the URL,
  //       dropping ai=true and adding tag=typescript.
  await withMockScript(testuser, 'search-resolves-to-typescript-tag');
  await testuser.goto('/search?q=foo&ai=true');
  await expect(testuser).toHaveURL(/[?&]tag=typescript/);
  await expect(search.searchResultItem(testuser)).toBeVisible();
});
