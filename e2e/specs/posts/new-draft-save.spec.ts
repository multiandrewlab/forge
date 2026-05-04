import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('new post: save draft persists and lands on the post detail page', async ({ actor }) => {
  await actor.goto('/posts/new');
  await expect(posts.postNewPage(actor)).toBeVisible();
  await posts.newPostTitle(actor).fill('Draft from E2E');
  await posts.newPostBody(actor).fill('console.log("hello e2e");');
  await posts.newPostSaveDraft(actor).click();

  await expect(actor).toHaveURL(/\/posts\/[a-f0-9-]+/);
  await expect(posts.draftBadge(actor)).toBeVisible();
});
