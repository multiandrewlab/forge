import type { APIRequestContext } from '@playwright/test';

/**
 * Drive the MockCloudflareStreamService lifecycle for a given cfUid.
 *
 * Posts to /api/__test__/cf-stream/advance — a 5-guard test route added in
 * issue #102 WU5b. The handler invokes `simulateLifecycle`, which synthesises
 * `video.ready` and `captions.ready` webhook events back into the video
 * pipeline. The intended progression is:
 *
 *   `uploading` → `processing` → `captions` → `suggesting` → `ready`
 *
 * Race note (E2E-only): the pipeline's webhook handlers schedule the
 * inter-event state transition (`processing` → `captions`) via
 * `setImmediate`. Inside `simulateLifecycle`, BOTH webhook events fire
 * back-to-back before that setImmediate has run — so the FIRST advance
 * call typically lands the row at `captions`, not `ready`. Subsequent
 * calls advance it further as soon as the deferred tick has executed.
 *
 * To keep the E2E specs declarative, this helper re-posts to `/advance`
 * up to a small number of times until the row reaches `ready` (or the
 * caller-supplied timeout expires). Each iteration covers one additional
 * state transition. Six attempts × 250 ms pacing leaves plenty of slack
 * for the deferred AI extraction even on a loaded CI runner.
 *
 * Auth: relies on `process.env.E2E_SECRET` — populated by `globalSetup`
 * (e2e/support/global-setup.ts). Throws clearly if the env var is missing
 * so a misconfigured run fails fast rather than silently 403-ing.
 *
 * Origin header: NOT sent. The test route rejects ANY request with an
 * Origin header (defensive same-site guard). APIRequestContext does not
 * attach Origin by default for server-side calls — leave it alone.
 */
export interface AdvanceOptions {
  cfUid: string;
  toState: 'ready';
  /** Total wall-clock budget in ms. Default 15_000. */
  timeoutMs?: number;
}

export async function advanceMockPipeline(
  request: APIRequestContext,
  args: AdvanceOptions,
): Promise<void> {
  const secret = process.env.E2E_SECRET;
  if (!secret) {
    throw new Error(
      '[cf-stream-mock-helpers] process.env.E2E_SECRET unset — ' +
        'global-setup did not run, or the server was started without ENABLE_TEST_ROUTES=1.',
    );
  }
  const budget = args.timeoutMs ?? 15_000;
  const deadline = Date.now() + budget;
  let attempt = 0;
  while (Date.now() < deadline) {
    attempt += 1;
    const res = await request.post('/api/__test__/cf-stream/advance', {
      headers: {
        'X-E2E-Secret': secret,
        'content-type': 'application/json',
      },
      data: { cfUid: args.cfUid, toState: args.toState },
    });
    if (!res.ok()) {
      const body = await res.text().catch(() => '<unreadable>');
      throw new Error(
        `[advanceMockPipeline] failed (cfUid=${args.cfUid}, attempt=${attempt}): ` +
          `HTTP ${res.status()}\n${body}`,
      );
    }
    // Brief pause so the setImmediate-scheduled state transition runs
    // between iterations. Without this gap, repeated advance calls would
    // all race the same deferred-task tick.
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (attempt >= 6) return;
  }
}
