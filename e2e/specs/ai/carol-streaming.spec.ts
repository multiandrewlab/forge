import { test, expect } from '../../fixtures/reset.js';
import { ai } from '../../fixtures/selectors/ai.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

// Both tests below exercise carol's per-userId AI rate-limiter slot. At
// workers=4 (CI) Playwright will otherwise schedule them on different workers
// concurrently, where one carol's in-flight stream causes the other's
// /api/ai/generate to 429 (or worse, leaves the slot held across the brief
// SSE finally → reply.raw.end() → slot.release() round-trip and the second
// test starts before the first cleans up). Forcing serial mode within this
// file keeps both carol-scoped streaming flows on the same worker.
test.describe.configure({ mode: 'serial' });

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

test('ai: loading -> partial -> completion (carol)', async ({ carol }) => {
  await withMockScript(carol, 'generate-readme-short');
  await carol.goto('/posts/new');

  // The preceding mid-stream-cancel test (also carol-scoped) aborts a stream
  // mid-flight. The server's per-userId AI slot is freed in the response
  // `finally` block, but the proxy chain (preview → API) plus the briefly-held
  // followup-probe slot can leave the slot held for a few hundred ms beyond
  // the previous test's last `await`. Poll the AI gate from the test side
  // before driving the UI so we don't flake on the slot-release race.
  const refresh = await carol.request.post('/api/auth/refresh');
  const { accessToken } = await refresh.json();
  await expect
    .poll(
      async () => {
        const probe = await carol.request.post('/api/ai/generate', {
          headers: { Authorization: `Bearer ${accessToken}`, 'X-Mock-Script': 'default' },
          data: { description: 'probe', contentType: 'snippet', language: 'typescript' },
        });
        const status = probe.status();
        // Drain the SSE body so the server's `reply.raw.end()` plus
        // `slot.release()` fire before the next probe runs.
        await probe.body();
        return status;
      },
      { timeout: 10_000, intervals: [100, 250, 500, 1_000, 2_000] },
    )
    .not.toBe(429);

  await ai.generateToggle(carol).click();
  await ai.generateDescription(carol).fill('Generate something');
  await ai.generateSubmit(carol).click();

  await expect(ai.generateLoading(carol)).toBeVisible();
  await expect
    .poll(async () => (await ai.editorContent(carol).textContent()) ?? '', { timeout: 10_000 })
    .toMatch(/.+/);
  await expect(ai.generateLoading(carol)).toHaveCount(0, { timeout: 10_000 });
});
