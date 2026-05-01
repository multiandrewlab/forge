import { test, expect } from '../../fixtures/reset.js';
import { playground } from '../../fixtures/selectors/playground.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

test('playground: required var → Run disabled, * indicator, aria-required, run-hint live region', async ({
  testuser,
}) => {
  await withMockScript(testuser, 'default');
  // Use the new fixture post (one NULL-default var named 'required_name')
  const fixturePostId = 'c0000000-0000-0000-0000-000000000050';
  await testuser.goto(`/playground/${fixturePostId}`);

  // Required indicator visible
  await expect(playground.variableRequiredMark(testuser, 'required_name')).toBeVisible();

  // aria-required asserted on the input
  const input = playground.variableInput(testuser, 'required_name');
  await expect(input).toHaveAttribute('aria-required', 'true');

  // Run button disabled, hint visible
  await expect(playground.runBtn(testuser)).toBeDisabled();
  await expect(playground.runHint(testuser)).toBeVisible();
  await expect(playground.runHint(testuser)).toContainText('Fill required variables');

  // Fill the input → enabled
  await input.fill('something');
  await expect(playground.runBtn(testuser)).toBeEnabled();
});
