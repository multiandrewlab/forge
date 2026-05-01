import { test, expect } from '../../fixtures/reset.js';
import { ai } from '../../fixtures/selectors/ai.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

test('ai: mid-stream cancel via page.evaluate returns UI to idle + releases rate-limit slot (carol)', async ({
  carol,
}) => {
  await withMockScript(carol, 'mid-stream-cancel');
  await carol.goto('/posts/new');
  await ai.generateToggle(carol).click();
  await ai.generateDescription(carol).fill('Anything');
  await ai.generateSubmit(carol).click();

  await expect(ai.generateLoading(carol)).toBeVisible();
  await expect(ai.editorContent(carol)).toContainText('partial', { timeout: 5_000 });

  // Cancel via the E2E hook (per DoD wording: page.evaluate)
  await carol.evaluate(() => {
    const win = window as Window & { __forgeE2eAiAbort?: () => void };
    win.__forgeE2eAiAbort?.();
  });

  await expect(ai.generateLoading(carol)).toHaveCount(0);

  // Verify rate-limit slot released — follow-up call must NOT 429.
  // Poll the gate so we tolerate the brief preview-proxy → API → finally
  // round-trip without flaking — what we care about is that the slot
  // becomes free in bounded time, not that it's free in <10ms.
  const refresh = await carol.request.post('/api/auth/refresh');
  const { accessToken } = await refresh.json();
  await expect
    .poll(
      async () => {
        const probe = await carol.request.post('/api/ai/generate', {
          headers: { Authorization: `Bearer ${accessToken}`, 'X-Mock-Script': 'default' },
          data: { description: 'Anything', contentType: 'snippet', language: 'typescript' },
        });
        const status = probe.status();
        // Drain the SSE body so the server's `reply.raw.end()` + `slot.release()`
        // fire before the next probe / next test runs.
        await probe.body();
        return status;
      },
      { timeout: 5_000, intervals: [50, 150, 300, 600, 1_000] },
    )
    .not.toBe(429);
});
