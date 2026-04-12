import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePostsStore } from '@/stores/posts';
import type { PostWithRevision, PostRevision } from '@forge/shared';
import { ContentType, Visibility } from '@forge/shared';

function createMockPost(overrides: Partial<PostWithRevision> = {}): PostWithRevision {
  return {
    id: 'post-1',
    authorId: 'user-1',
    title: 'Test Post',
    contentType: ContentType.Snippet,
    language: 'typescript',
    visibility: Visibility.Public,
    isDraft: true,
    forkedFromId: null,
    linkUrl: null,
    linkPreview: null,
    voteCount: 0,
    viewCount: 0,
    deletedAt: null,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    revisions: [
      {
        id: 'rev-1',
        postId: 'post-1',
        content: 'console.log("hello")',
        message: null,
        revisionNumber: 1,
        createdAt: new Date('2025-01-01'),
      },
    ],
    ...overrides,
  };
}

function createMockRevision(overrides: Partial<PostRevision> = {}): PostRevision {
  return {
    id: 'rev-2',
    postId: 'post-1',
    content: 'updated content',
    message: 'revision message',
    revisionNumber: 2,
    createdAt: new Date('2025-01-02'),
    ...overrides,
  };
}

/** Returns the value as it would appear after JSON round-trip (dates become strings). */
function jsonRoundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

// Mock the apiFetch module
const mockApiFetch = vi.fn();
vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args) as unknown,
}));

// Import composable after mock setup
import { usePosts } from '@/composables/usePosts';

describe('usePosts', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
  });

  describe('reactive state', () => {
    it('should expose currentPost from store', () => {
      const { currentPost } = usePosts();
      expect(currentPost.value).toBeNull();

      const store = usePostsStore();
      const post = createMockPost();
      store.setPost(post);

      expect(currentPost.value).toEqual(post);
    });

    it('should expose isDirty from store', () => {
      const { isDirty } = usePosts();
      expect(isDirty.value).toBe(false);

      const store = usePostsStore();
      store.setDirty(true);

      expect(isDirty.value).toBe(true);
    });

    it('should expose saveStatus from store', () => {
      const { saveStatus } = usePosts();
      expect(saveStatus.value).toBe('unsaved');

      const store = usePostsStore();
      store.setSaveStatus('saving');

      expect(saveStatus.value).toBe('saving');
    });

    it('should expose lastSavedAt from store', () => {
      const { lastSavedAt } = usePosts();
      expect(lastSavedAt.value).toBeNull();

      const store = usePostsStore();
      store.setSaveStatus('saved');

      expect(lastSavedAt.value).not.toBeNull();
    });

    it('should expose error as a reactive ref initialized to null', () => {
      const { error } = usePosts();
      expect(error.value).toBeNull();
    });
  });

  describe('createPost', () => {
    it('should POST to /api/posts and return the post id', async () => {
      const mockPost = createMockPost();
      mockApiFetch.mockResolvedValue(new Response(JSON.stringify(mockPost), { status: 201 }));

      const { createPost } = usePosts();
      const id = await createPost({
        title: 'Test Post',
        contentType: ContentType.Snippet,
        language: 'typescript',
        visibility: Visibility.Public,
      });

      expect(id).toBe('post-1');
      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Test Post',
          contentType: ContentType.Snippet,
          language: 'typescript',
          visibility: Visibility.Public,
        }),
      });
    });

    it('should return null and set error on failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Validation failed' }), { status: 400 }),
      );

      const { createPost, error } = usePosts();
      const id = await createPost({
        title: '',
        contentType: ContentType.Snippet,
        language: null,
        visibility: Visibility.Public,
      });

      expect(id).toBeNull();
      expect(error.value).toBe('Validation failed');
    });

    it('should return null and set error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { createPost, error } = usePosts();
      const id = await createPost({
        title: 'Test',
        contentType: ContentType.Snippet,
        language: null,
        visibility: Visibility.Public,
      });

      expect(id).toBeNull();
      expect(error.value).toBe('Network error');
    });

    it('should use fallback error message for non-Error thrown values', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { createPost, error } = usePosts();
      const id = await createPost({
        title: 'Test',
        contentType: ContentType.Snippet,
        language: null,
        visibility: Visibility.Public,
      });

      expect(id).toBeNull();
      expect(error.value).toBe('Failed to create post');
    });

    it('should use fallback error when error response body is not valid JSON (parseErrorMessage catch branch)', async () => {
      // Simulate a non-ok response whose .json() throws (non-JSON body)
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('not json')),
      } as unknown as Response);

      const { createPost, error } = usePosts();
      const id = await createPost({
        title: 'Test',
        contentType: ContentType.Snippet,
        language: null,
        visibility: Visibility.Public,
      });

      expect(id).toBeNull();
      expect(error.value).toBe('Failed to create post');
    });

    it('should use fallback error when error response JSON has no error field (parseErrorMessage ?? branch)', async () => {
      // Non-ok response whose .json() resolves with no `error` key — hits data.error ?? fallback
      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      } as unknown as Response);

      const { createPost, error } = usePosts();
      const id = await createPost({
        title: 'Test',
        contentType: ContentType.Snippet,
        language: null,
        visibility: Visibility.Public,
      });

      expect(id).toBeNull();
      expect(error.value).toBe('Failed to create post');
    });

    it('should clear previous error on new call', async () => {
      mockApiFetch.mockResolvedValueOnce(
        new Response(JSON.stringify({ error: 'Validation failed' }), { status: 400 }),
      );

      const { createPost, error } = usePosts();
      await createPost({
        title: '',
        contentType: ContentType.Snippet,
        language: null,
        visibility: Visibility.Public,
      });
      expect(error.value).toBe('Validation failed');

      const mockPost = createMockPost();
      mockApiFetch.mockResolvedValueOnce(new Response(JSON.stringify(mockPost), { status: 201 }));

      await createPost({
        title: 'Test',
        contentType: ContentType.Snippet,
        language: null,
        visibility: Visibility.Public,
      });
      expect(error.value).toBeNull();
    });
  });

  describe('fetchPost', () => {
    it('should GET /api/posts/:id and store the result', async () => {
      const mockPost = createMockPost();
      mockApiFetch.mockResolvedValue(new Response(JSON.stringify(mockPost), { status: 200 }));

      const { fetchPost } = usePosts();
      await fetchPost('post-1');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1');

      const store = usePostsStore();
      expect(store.currentPost).toEqual(jsonRoundTrip(mockPost));
    });

    it('should set error on failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
      );

      const { fetchPost, error } = usePosts();
      await fetchPost('nonexistent');

      expect(error.value).toBe('Not found');
    });

    it('should set generic error on non-JSON failure', async () => {
      mockApiFetch.mockResolvedValue(new Response('Server Error', { status: 500 }));

      const { fetchPost, error } = usePosts();
      await fetchPost('post-1');

      expect(error.value).toBe('Failed to fetch post');
    });

    it('should set error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { fetchPost, error } = usePosts();
      await fetchPost('post-1');

      expect(error.value).toBe('Network error');
    });

    it('should use fallback error for non-Error thrown values', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { fetchPost, error } = usePosts();
      await fetchPost('post-1');

      expect(error.value).toBe('Failed to fetch post');
    });
  });

  describe('updatePost', () => {
    it('should PATCH /api/posts/:id with provided data', async () => {
      const updatedPost = createMockPost({ title: 'Updated Title' });
      mockApiFetch.mockResolvedValue(new Response(JSON.stringify(updatedPost), { status: 200 }));

      const { updatePost } = usePosts();
      await updatePost('post-1', { title: 'Updated Title' });

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Updated Title' }),
      });
    });

    it('should update the store with the response', async () => {
      const updatedPost = createMockPost({ title: 'Updated Title' });
      mockApiFetch.mockResolvedValue(new Response(JSON.stringify(updatedPost), { status: 200 }));

      const { updatePost } = usePosts();
      await updatePost('post-1', { title: 'Updated Title' });

      const store = usePostsStore();
      expect(store.currentPost).toEqual(jsonRoundTrip(updatedPost));
    });

    it('should set error on failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
      );

      const { updatePost, error } = usePosts();
      await updatePost('post-1', { title: 'Updated Title' });

      expect(error.value).toBe('Forbidden');
    });

    it('should set error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { updatePost, error } = usePosts();
      await updatePost('post-1', { title: 'Updated Title' });

      expect(error.value).toBe('Network error');
    });

    it('should use fallback error for non-Error thrown values', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { updatePost, error } = usePosts();
      await updatePost('post-1', { title: 'Updated Title' });

      expect(error.value).toBe('Failed to update post');
    });
  });

  describe('deletePost', () => {
    it('should DELETE /api/posts/:id', async () => {
      mockApiFetch.mockResolvedValue(new Response(null, { status: 200 }));

      const { deletePost } = usePosts();
      await deletePost('post-1');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1', {
        method: 'DELETE',
      });
    });

    it('should clear the store after successful delete', async () => {
      const store = usePostsStore();
      store.setPost(createMockPost());

      mockApiFetch.mockResolvedValue(new Response(null, { status: 200 }));

      const { deletePost } = usePosts();
      await deletePost('post-1');

      expect(store.currentPost).toBeNull();
    });

    it('should set error on failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403 }),
      );

      const { deletePost, error } = usePosts();
      await deletePost('post-1');

      expect(error.value).toBe('Forbidden');
    });

    it('should set error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { deletePost, error } = usePosts();
      await deletePost('post-1');

      expect(error.value).toBe('Network error');
    });

    it('should use fallback error for non-Error thrown values', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { deletePost, error } = usePosts();
      await deletePost('post-1');

      expect(error.value).toBe('Failed to delete post');
    });
  });

  describe('publishPost', () => {
    it('should PATCH /api/posts/:id/publish', async () => {
      const publishedPost = createMockPost({ isDraft: false });
      mockApiFetch.mockResolvedValue(new Response(JSON.stringify(publishedPost), { status: 200 }));

      const { publishPost } = usePosts();
      await publishPost('post-1');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1/publish', {
        method: 'PATCH',
      });
    });

    it('should update the store with the published post', async () => {
      const publishedPost = createMockPost({ isDraft: false });
      mockApiFetch.mockResolvedValue(new Response(JSON.stringify(publishedPost), { status: 200 }));

      const { publishPost } = usePosts();
      await publishPost('post-1');

      const store = usePostsStore();
      expect(store.currentPost).toEqual(jsonRoundTrip(publishedPost));
    });

    it('should set error on failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Cannot publish' }), { status: 400 }),
      );

      const { publishPost, error } = usePosts();
      await publishPost('post-1');

      expect(error.value).toBe('Cannot publish');
    });

    it('should set error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { publishPost, error } = usePosts();
      await publishPost('post-1');

      expect(error.value).toBe('Network error');
    });

    it('should use fallback error for non-Error thrown values', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { publishPost, error } = usePosts();
      await publishPost('post-1');

      expect(error.value).toBe('Failed to publish post');
    });
  });

  describe('saveRevision', () => {
    it('should POST /api/posts/:id/revisions with content and message', async () => {
      const mockRevision = createMockRevision();
      mockApiFetch.mockResolvedValue(new Response(JSON.stringify(mockRevision), { status: 201 }));

      const { saveRevision } = usePosts();
      await saveRevision('post-1', 'updated content', 'revision message');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1/revisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: 'updated content', message: 'revision message' }),
      });
    });

    it('should set saveStatus to "saving" then "saved" on success', async () => {
      const store = usePostsStore();
      const statusHistory: string[] = [];

      // Track status changes by intercepting the mock
      const mockRevision = createMockRevision();
      mockApiFetch.mockImplementation(() => {
        // At this point, saveStatus should already be "saving"
        statusHistory.push(store.saveStatus);
        return Promise.resolve(new Response(JSON.stringify(mockRevision), { status: 201 }));
      });

      const { saveRevision } = usePosts();
      await saveRevision('post-1', 'content', null);

      statusHistory.push(store.saveStatus);

      expect(statusHistory).toEqual(['saving', 'saved']);
    });

    it('should set saveStatus to "error" on failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Save failed' }), { status: 500 }),
      );

      const { saveRevision } = usePosts();
      await saveRevision('post-1', 'content', null);

      const store = usePostsStore();
      expect(store.saveStatus).toBe('error');
    });

    it('should set error on failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Save failed' }), { status: 500 }),
      );

      const { saveRevision, error } = usePosts();
      await saveRevision('post-1', 'content', null);

      expect(error.value).toBe('Save failed');
    });

    it('should set saveStatus to "error" on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { saveRevision } = usePosts();
      await saveRevision('post-1', 'content', null);

      const store = usePostsStore();
      expect(store.saveStatus).toBe('error');
    });

    it('should set error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { saveRevision, error } = usePosts();
      await saveRevision('post-1', 'content', null);

      expect(error.value).toBe('Network error');
    });

    it('should use fallback error for non-Error thrown values', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { saveRevision, error } = usePosts();
      await saveRevision('post-1', 'content', null);

      expect(error.value).toBe('Failed to save revision');
    });
  });

  describe('fetchRevisions', () => {
    it('should GET /api/posts/:id/revisions and return the list', async () => {
      const mockRevisions = [createMockRevision()];
      mockApiFetch.mockResolvedValue(new Response(JSON.stringify(mockRevisions), { status: 200 }));

      const { fetchRevisions } = usePosts();
      const revisions = await fetchRevisions('post-1');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1/revisions');
      expect(revisions).toEqual(jsonRoundTrip(mockRevisions));
    });

    it('should return empty array and set error on failure', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(JSON.stringify({ error: 'Not found' }), { status: 404 }),
      );

      const { fetchRevisions, error } = usePosts();
      const revisions = await fetchRevisions('nonexistent');

      expect(revisions).toEqual([]);
      expect(error.value).toBe('Not found');
    });

    it('should return empty array and set generic error on non-JSON failure', async () => {
      mockApiFetch.mockResolvedValue(new Response('Server Error', { status: 500 }));

      const { fetchRevisions, error } = usePosts();
      const revisions = await fetchRevisions('post-1');

      expect(revisions).toEqual([]);
      expect(error.value).toBe('Failed to fetch revisions');
    });

    it('should return empty array and set error on network failure', async () => {
      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const { fetchRevisions, error } = usePosts();
      const revisions = await fetchRevisions('post-1');

      expect(revisions).toEqual([]);
      expect(error.value).toBe('Network error');
    });

    it('should use fallback error for non-Error thrown values', async () => {
      mockApiFetch.mockRejectedValue('string-error');

      const { fetchRevisions, error } = usePosts();
      const revisions = await fetchRevisions('post-1');

      expect(revisions).toEqual([]);
      expect(error.value).toBe('Failed to fetch revisions');
    });
  });
});
