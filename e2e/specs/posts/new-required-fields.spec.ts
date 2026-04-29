import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('new post: empty title disables the save button', async ({ testuser }) => {
  await testuser.goto('/posts/new');
  await posts.newPostBody(testuser).fill('body without a title');
  await expect(posts.newPostSaveDraft(testuser)).toBeDisabled();
});
