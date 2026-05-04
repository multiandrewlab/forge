import { test, expect } from '../../fixtures/reset.js';
import { playground } from '../../fixtures/selectors/playground.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

test('playground: variable with defaultValue is NOT required; Run enabled even when input empty', async ({
  actor,
}) => {
  await withMockScript(actor, 'default');
  // Demo prompt post (after WU3 seed update, all variables have defaults)
  const demoPostId = 'c0000000-0000-0000-0000-000000000004';
  await actor.goto(`/playground/${demoPostId}`);

  // No * indicator on any variable (count 0 across the page)
  await expect(playground.variableRequiredMark(actor, 'props')).toHaveCount(0);
  // Run enabled even when inputs are at their default-empty state
  await expect(playground.runBtn(actor)).toBeEnabled();
});
