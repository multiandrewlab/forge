import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../../fixtures/reset.js';
import { advanceMockPipeline } from '../../fixtures/cf-stream-mock-helpers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SAMPLE_VIDEO_PATH = join(__dirname, '..', '..', 'fixtures', 'sample-video.mp4');

/**
 * Spec §11.3 + §8.2 — visibility-before-existence for private video posts.
 *
 *   actor creates a PRIVATE video post and drives it to ready, then
 *   secondActor (a different e2e_wN user, see secondActor fixture #102 WU9
 *   §9.0) attempts to read the post and its playback URL — both must be
 *   blocked.
 *
 * Behavior assertion: the visibility helper `assertCanReadPost`
 * (packages/server/src/lib/visibility.ts) returns 403 for the
 * private-post-to-non-owner case. The spec §8.2 ideal is 404
 * (visibility-before-existence — never leak existence), but the live
 * helper returns 403 and the Bruno regression matches that today; this
 * E2E mirrors live behavior so both gates flip together when the
 * deferred WU5 #6 follow-up lands. The page chrome renders the
 * forbidden-page testid for the 403 branch.
 */
test('video private-access: non-owner sees 403 / forbidden-page, not the resource', async ({
  actor,
  secondActor,
  request,
}) => {
  // ── actor: mint a token and create a PRIVATE video draft ─────────────
  const refresh = await actor.request.post('/api/auth/refresh');
  expect(refresh.ok()).toBe(true);
  const { accessToken } = (await refresh.json()) as { accessToken: string };

  const created = await actor.request.post('/api/posts', {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      title: 'Private video — should 404/403 to non-owners',
      contentType: 'video',
      visibility: 'private',
    },
  });
  expect(created.ok()).toBe(true);
  const {
    post: { id: postId },
  } = (await created.json()) as { post: { id: string } };

  // Mint an upload URL → server inserts post_videos row with cfUid.
  const uploadUrlRes = await actor.request.post(`/api/posts/${postId}/video/upload-url`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { filename: 'private.mp4', fileSizeBytes: 3051 },
  });
  expect(uploadUrlRes.ok()).toBe(true);
  const { cfUid } = (await uploadUrlRes.json()) as { cfUid: string };
  expect(cfUid).toMatch(/^cf_mock_/);

  // Drive to ready and publish, so the post is fully real (no draft fallback).
  await advanceMockPipeline(request, { cfUid, toState: 'ready' });
  await expect
    .poll(
      async () => {
        const r = await actor.request.get(`/api/posts/${postId}/video/suggestions`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!r.ok()) return null;
        const body = (await r.json()) as { status: string };
        return body.status;
      },
      { timeout: 15_000, message: 'pipeline never reached ready' },
    )
    .toBe('ready');
  const publish = await actor.request.post(`/api/posts/${postId}/publish`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(publish.ok()).toBe(true);

  // Sanity: just owning the file mutation alone doesn't guarantee a private
  // assertion — we also confirm the post is still `private` server-side.
  const sanity = await actor.request.get(`/api/posts/${postId}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  expect(sanity.ok()).toBe(true);
  const sanityBody = (await sanity.json()) as { post: { visibility: string } };
  expect(sanityBody.post.visibility).toBe('private');

  // ── secondActor: non-owner read attempts ─────────────────────────────
  const secondRefresh = await secondActor.request.post('/api/auth/refresh');
  expect(secondRefresh.ok()).toBe(true);
  const { accessToken: secondToken } = (await secondRefresh.json()) as {
    accessToken: string;
  };

  // 1. The detail GET is blocked at the helper.
  const getDetail = await secondActor.request.get(`/api/posts/${postId}`, {
    headers: { Authorization: `Bearer ${secondToken}` },
  });
  expect(getDetail.status()).toBe(403);

  // 2. The video playback URL mint uses the STRICT visibility helper
  //    (`assertCanReadPostStrict` — see WU5 #6 fix). Per spec §8.2
  //    visibility-before-existence, a non-owner reading a private video
  //    must get 404 (not 403) so the response does not reveal that the
  //    post exists at all.
  const playback = await secondActor.request.get(`/api/posts/${postId}/video/playback`, {
    headers: { Authorization: `Bearer ${secondToken}` },
  });
  expect(playback.status()).toBe(404);

  // 3. Navigating in the browser surfaces the forbidden-page chrome.
  await secondActor.goto(`/posts/${postId}`);
  await expect(secondActor.getByTestId('forbidden-page')).toBeVisible();

  // The sample MP4 file fixture is referenced for parity with the upload
  // spec — keeping the import shape stable across the video spec suite.
  expect(SAMPLE_VIDEO_PATH).toMatch(/sample-video\.mp4$/);
});
