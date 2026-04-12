import { ref } from 'vue';
import { apiFetch } from '../lib/api.js';
import { useCommentsStore } from '../stores/comments.js';
import type { Comment } from '@forge/shared';

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    return data.error ?? fallback;
  } catch {
    return fallback;
  }
}

interface AddCommentInput {
  body: string;
  parentId?: string;
  lineNumber?: number;
  revisionId?: string;
}

export function useComments() {
  const store = useCommentsStore();
  const error = ref<string | null>(null);
  const loading = ref(false);

  async function fetchComments(postId: string): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/posts/${postId}/comments`);
      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to load comments');
        return;
      }
      const data = (await response.json()) as { comments: Comment[] };
      store.setComments(data.comments);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load comments';
    } finally {
      loading.value = false;
    }
  }

  async function addComment(postId: string, input: AddCommentInput): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/posts/${postId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to add comment');
        return;
      }
      const data = (await response.json()) as { comment: Comment };
      store.addComment(data.comment);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to add comment';
    } finally {
      loading.value = false;
    }
  }

  async function editComment(postId: string, commentId: string, body: string): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/posts/${postId}/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to edit comment');
        return;
      }
      const data = (await response.json()) as { comment: Comment };
      store.updateComment(commentId, data.comment);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to edit comment';
    } finally {
      loading.value = false;
    }
  }

  async function deleteComment(postId: string, commentId: string): Promise<void> {
    error.value = null;
    loading.value = true;
    try {
      const response = await apiFetch(`/api/posts/${postId}/comments/${commentId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        error.value = await parseErrorMessage(response, 'Failed to delete comment');
        return;
      }
      store.removeComment(commentId);
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to delete comment';
    } finally {
      loading.value = false;
    }
  }

  return {
    error,
    loading,
    fetchComments,
    addComment,
    editComment,
    deleteComment,
  };
}
