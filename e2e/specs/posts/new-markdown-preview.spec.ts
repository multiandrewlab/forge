import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('new post: markdown body renders preview with formatted output', async ({ testuser }) => {
  await testuser.goto('/posts/new');
  await posts.newPostTitle(testuser).fill('MD preview test');
  await testuser.getByTestId('content-type-select').selectOption('document');
  await posts.newPostBody(testuser).fill('# heading\n\n**bold** word');

  const preview = testuser.getByTestId('markdown-preview');
  await expect(preview.locator('h1')).toHaveText('heading');
});
