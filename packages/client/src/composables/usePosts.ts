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

      const data = (await response.json()) as PostWithRevision;
      return data.id;
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

      const data = (await response.json()) as PostWithRevision;
      store.setPost(data);
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
        method: 'PATCH',
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
      const response = await apiFetch(`/api/posts/${postId}/revisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, message }),
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

      return (await response.json()) as PostRevision[];
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch revisions';
      return [];
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
  };
}
