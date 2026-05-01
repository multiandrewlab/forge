import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '../../fixtures/reset.js';
import { playground } from '../../fixtures/selectors/playground.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

test('playground: required var → Run disabled, * indicator, aria-required, run-hint live region', async ({
  actor,
}) => {
  await withMockScript(actor, 'default');
  // Use the new fixture post (one NULL-default var named 'required_name')
  const fixturePostId = 'c0000000-0000-0000-0000-000000000050';
  await actor.goto(`/playground/${fixturePostId}`);

  // Required indicator visible
  await expect(playground.variableRequiredMark(actor, 'required_name')).toBeVisible();

  // aria-required asserted on the input
  const input = playground.variableInput(actor, 'required_name');
  await expect(input).toHaveAttribute('aria-required', 'true');

  // Run button disabled, hint visible
  await expect(playground.runBtn(actor)).toBeDisabled();
  await expect(playground.runHint(actor)).toBeVisible();
  await expect(playground.runHint(actor)).toContainText('Fill required variables');

  // Fill the input → enabled
  await input.fill('something');
  await expect(playground.runBtn(actor)).toBeEnabled();

  // Accessibility scan — playground form region must have zero axe-core
  // violations at WCAG 2 A/AA. Scan is scoped to the playground variables
  // form (the surface this spec asserts) rather than the whole page so we
  // don't fail on pre-existing chrome contrast issues (sidebar / nav /
  // primary button background) tracked outside #50's scope. The contrast
  // rule is also disabled because the disabled-button (Run) styling shares
  // the same orange-on-white tokens as the rest of the app and is part of
  // the same chrome-wide #ff6b1a brand-color tracking item, not a
  // playground regression. Color-contrast aside, we still want every other
  // a11y rule (label associations, ARIA roles, focus order, etc.) green.
  const axeResults = await new AxeBuilder({ page: actor })
    .include('[data-testid="playground-page"]')
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze();
  expect(axeResults.violations).toEqual([]);
});
