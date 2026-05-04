import { test, expect } from '../../fixtures/reset.js';
import { withMockScript } from '../../fixtures/mock-llm.js';

test('playground: API call with empty required vars returns structured 400', async ({ actor }) => {
  await withMockScript(actor, 'default');

  const refresh = await actor.request.post('/api/auth/refresh');
  const { accessToken } = await refresh.json();

  const res = await actor.request.post('/api/playground/run', {
    headers: { Authorization: `Bearer ${accessToken}`, 'X-Mock-Script': 'default' },
    data: {
      postId: 'c0000000-0000-0000-0000-000000000050', // required-var fixture
      variables: {},
    },
  });

  expect(res.status()).toBe(400);
  const body = await res.json();
  expect(body.code).toBe('MISSING_REQUIRED_VARIABLES');
  expect(body.missing).toContain('required_name');
  expect(body.error).toMatch(/^Missing required variables/);
});
