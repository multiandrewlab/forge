import { test, expect } from '../../fixtures/reset.js';
import { posts } from '../../fixtures/selectors/posts.js';

test('new post: markdown body renders preview with formatted output', async ({ actor }) => {
  await actor.goto('/posts/new');
  await posts.newPostTitle(actor).fill('MD preview test');
  await actor.getByTestId('content-type-select').selectOption('document');
  await posts.newPostBody(actor).fill('# heading\n\n**bold** word');

  const preview = actor.getByTestId('markdown-preview');
  await expect(preview.locator('h1')).toHaveText('heading');
});
