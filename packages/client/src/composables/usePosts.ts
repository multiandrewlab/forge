import { ref } from 'vue';
import { storeToRefs } from 'pinia';
import { usePostsStore } from '@/stores/posts';
import { apiFetch } from '@/lib/api';
import type { PostWithRevision, PostRevision } from '@forge/shared';
import type { ContentType, Visibility } from '@forge/shared';

interface CreatePostInput {
  title: string;
  contentType: ContentType;
  language: string | null;
  visibility: Visibility;
  content?: string;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

export function usePosts() {
  const store = usePostsStore();
  const { currentPost, isDirty, saveStatus, lastSavedAt } = storeToRefs(store);
  const error = ref<string | null>(null);

  async function createPost(input: CreatePostInput): Promise<string | null> {
    error.value = null;
    try {
      const response = await apiFetch('/api/posts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to create post');
        return null;
      }

      // Server returns either a bare post or a {post, revision} wrapper when
      // an inline `content` field is supplied at create time. Handle both.
      const data = (await response.json()) as
        | PostWithRevision
        | { post: PostWithRevision; revision: unknown };
      const id = 'post' in data ? data.post.id : data.id;
      return id;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to create post';
      return null;
    }
  }

  async function fetchPost(id: string): Promise<void> {
    error.value = null;
    try {
      const response = await apiFetch(`/api/posts/${id}`);

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to fetch post');
        return;
      }

      // Server wraps the response as `{ post: PostWithRevision }`. Older test
      // mocks return the bare post — handle both for compatibility.
      const data = (await response.json()) as PostWithRevision | { post: PostWithRevision };
      const post = 'post' in data ? data.post : data;
      store.setPost(post);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch post';
    }
  }

  async function updatePost(id: string, data: Partial<CreatePostInput>): Promise<void> {
    error.value = null;
    try {
      const response = await apiFetch(`/api/posts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to update post');
        return;
      }

      const updated = (await response.json()) as PostWithRevision;
      store.setPost(updated);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to update post';
    }
  }

  async function deletePost(id: string): Promise<void> {
    error.value = null;
    try {
      const response = await apiFetch(`/api/posts/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to delete post');
        return;
      }

      store.clearPost();
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete post';
    }
  }

  async function publishPost(id: string): Promise<void> {
    error.value = null;
    try {
      const response = await apiFetch(`/api/posts/${id}/publish`, {
        method: 'POST',
      });

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to publish post');
        return;
      }

      const published = (await response.json()) as PostWithRevision;
      store.setPost(published);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to publish post';
    }
  }

  async function saveRevision(
    postId: string,
    content: string,
    message: string | null,
  ): Promise<void> {
    error.value = null;
    store.setSaveStatus('saving');
    try {
      // Server's createRevisionSchema treats `message` as optional string —
      // sending an explicit null fails validation, so we only include the
      // field when the caller actually has a message to attach.
      const body: { content: string; message?: string } = { content };
      if (message !== null) body.message = message;
      const response = await apiFetch(`/api/posts/${postId}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to save revision');
        store.setSaveStatus('error');
        return;
      }

      store.setSaveStatus('saved');
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to save revision';
      store.setSaveStatus('error');
    }
  }

  async function fetchRevisions(postId: string): Promise<PostRevision[]> {
    error.value = null;
    try {
      const response = await apiFetch(`/api/posts/${postId}/revisions`);

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to fetch revisions');
        return [];
      }

      const data = (await response.json()) as { revisions: PostRevision[] };
      return data.revisions;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch revisions';
      return [];
    }
  }

  async function restoreRevision(
    postId: string,
    revisionNumber: number,
  ): Promise<PostRevision | null> {
    error.value = null;
    try {
      const response = await apiFetch(`/api/posts/${postId}/revisions/${revisionNumber}/restore`, {
        method: 'POST',
      });

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to restore revision');
        return null;
      }

      const data = (await response.json()) as { revision: PostRevision };
      return data.revision;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to restore revision';
      return null;
    }
  }

  async function forkPost(sourcePostId: string): Promise<string | null> {
    error.value = null;
    try {
      const response = await apiFetch(`/api/posts/${sourcePostId}/fork`, {
        method: 'POST',
      });

      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to fork post');
        return null;
      }

      const data = (await response.json()) as { post: { id: string } };
      return data.post.id;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fork post';
      return null;
    }
  }

  return {
    currentPost,
    isDirty,
    saveStatus,
    lastSavedAt,
    error,
    createPost,
    fetchPost,
    updatePost,
    deletePost,
    publishPost,
    saveRevision,
    fetchRevisions,
    restoreRevision,
    forkPost,
  };
}
