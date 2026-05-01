import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('new post: empty title disables the save button', async ({ actor }) => {
  await actor.goto('/posts/new');
  await posts.newPostBody(actor).fill('body without a title');
  await expect(posts.newPostSaveDraft(actor)).toBeDisabled();
});
