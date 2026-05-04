import { test, expect } from '../../fixtures/reset.js';
import { comments } from '../../fixtures/selectors/comments.js';

test('comments: create top-level — actor posts on alice cheatsheet', async ({ actor }) => {
  const cheatsheetId = 'c0000000-0000-0000-0000-000000000001';
  await actor.goto(`/posts/${cheatsheetId}`);

  // Store the exact body so the assertion can match the precise text rather
  // than a regex that could collide with unrelated content.
  const body = `e2e-comment-${Date.now()}`;
  await comments.input(actor).fill(body);
  await comments.submit(actor).click();

  await expect(actor.getByTestId('comment-section')).toContainText(body);
});
