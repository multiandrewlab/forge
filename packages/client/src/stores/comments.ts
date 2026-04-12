import { ref, computed } from 'vue';
import { defineStore } from 'pinia';
import type { Comment } from '@forge/shared';

export interface CommentTreeNode extends Comment {
  children: CommentTreeNode[];
}

export const useCommentsStore = defineStore('comments', () => {
  const comments = ref<Comment[]>([]);
  const currentRevisionId = ref<string | null>(null);

  function setComments(newComments: Comment[]): void {
    comments.value = newComments;
  }

  function setCurrentRevisionId(revisionId: string | null): void {
    currentRevisionId.value = revisionId;
  }

  function addComment(comment: Comment): void {
    comments.value.push(comment);
  }

  function updateComment(id: string, updated: Comment): void {
    const idx = comments.value.findIndex((c) => c.id === id);
    if (idx !== -1) {
      comments.value[idx] = updated;
    }
  }

  function removeComment(id: string): void {
    comments.value = comments.value.filter((c) => c.id !== id);
  }

  function clearComments(): void {
    comments.value = [];
    currentRevisionId.value = null;
  }

  const generalComments = computed(() =>
    comments.value.filter((c) => c.lineNumber === null && c.parentId === null),
  );

  const commentTree = computed((): CommentTreeNode[] => {
    const general = comments.value.filter((c) => c.lineNumber === null);
    const map = new Map<string, CommentTreeNode>();

    for (const c of general) {
      map.set(c.id, { ...c, children: [] });
    }

    const roots: CommentTreeNode[] = [];
    for (const node of map.values()) {
      const parent = node.parentId ? map.get(node.parentId) : undefined;
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots;
  });

  const inlineComments = computed(() => {
    const grouped = new Map<number, Comment[]>();
    for (const c of comments.value) {
      if (
        c.lineNumber !== null &&
        c.parentId === null &&
        c.revisionId === currentRevisionId.value
      ) {
        const existing = grouped.get(c.lineNumber) ?? [];
        existing.push(c);
        grouped.set(c.lineNumber, existing);
      }
    }
    return grouped;
  });

  const staleComments = computed(() =>
    comments.value.filter(
      (c) =>
        c.lineNumber !== null &&
        c.parentId === null &&
        c.revisionId !== null &&
        c.revisionId !== currentRevisionId.value,
    ),
  );

  return {
    comments,
    currentRevisionId,
    setComments,
    setCurrentRevisionId,
    addComment,
    updateComment,
    removeComment,
    clearComments,
    generalComments,
    commentTree,
    inlineComments,
    staleComments,
  };
});
