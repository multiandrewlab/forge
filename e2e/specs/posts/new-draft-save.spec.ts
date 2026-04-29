import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('new post: save draft persists and lands on the post detail page', async ({ testuser }) => {
  await testuser.goto('/posts/new');
  await expect(posts.postNewPage(testuser)).toBeVisible();
  await posts.newPostTitle(testuser).fill('Draft from E2E');
  await posts.newPostBody(testuser).fill('console.log("hello e2e");');
  await posts.newPostSaveDraft(testuser).click();

  await expect(testuser).toHaveURL(/\/posts\/[a-f0-9-]+/);
  await expect(posts.draftBadge(testuser)).toBeVisible();
});
