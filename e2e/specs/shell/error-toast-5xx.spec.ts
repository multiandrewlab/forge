// e2e/specs/shell/error-toast-5xx.spec.ts
import { test, expect } from '../../fixtures/reset.js';
import { shell } from '../../fixtures/selectors/shell.js';
import { api500 } from '../../fixtures/network-faults.js';

test.describe('shell: error toast on 5xx', () => {
  test('shows toast when /api/posts feed returns 500, dismissable by user', async ({ actor }) => {
    await api500(actor, '**/api/posts**');

    await actor.goto('/');

    await expect(shell.errorToast(actor).first()).toBeVisible();
    await expect(shell.errorToast(actor).first()).toHaveAttribute('role', 'status');

    await shell.errorToastDismiss(actor).first().click();
    await expect(shell.errorToast(actor)).toHaveCount(0);

    await actor.unroute('**/api/posts**');
  });
});
