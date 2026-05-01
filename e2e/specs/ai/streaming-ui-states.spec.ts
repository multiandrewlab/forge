import { test, expect } from '../../fixtures/reset.js';
import { ai } from '../../fixtures/selectors/ai.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

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
