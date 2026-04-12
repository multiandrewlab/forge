import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useCommentsStore } from '@/stores/comments';
import type { Comment } from '@forge/shared';

function createMockComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'comment-1',
    postId: 'post-1',
    author: { id: 'user-1', displayName: 'Test User', avatarUrl: null },
    parentId: null,
    lineNumber: null,
    revisionId: null,
    revisionNumber: null,
    body: 'Test comment',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('useCommentsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('should have empty comments array by default', () => {
      const store = useCommentsStore();
      expect(store.comments).toEqual([]);
    });

    it('should have null currentRevisionId by default', () => {
      const store = useCommentsStore();
      expect(store.currentRevisionId).toBeNull();
    });
  });

  describe('setComments', () => {
    it('should replace the comments array', () => {
      const store = useCommentsStore();
      const comments = [createMockComment({ id: 'c1' }), createMockComment({ id: 'c2' })];

      store.setComments(comments);

      expect(store.comments).toEqual(comments);
      expect(store.comments).toHaveLength(2);
    });

    it('should replace existing comments', () => {
      const store = useCommentsStore();
      store.setComments([createMockComment({ id: 'c1' })]);

      store.setComments([createMockComment({ id: 'c2' })]);

      expect(store.comments).toHaveLength(1);
      expect(store.comments[0].id).toBe('c2');
    });
  });

  describe('setCurrentRevisionId', () => {
    it('should set the current revision id', () => {
      const store = useCommentsStore();

      store.setCurrentRevisionId('rev-1');

      expect(store.currentRevisionId).toBe('rev-1');
    });

    it('should set to null', () => {
      const store = useCommentsStore();
      store.setCurrentRevisionId('rev-1');

      store.setCurrentRevisionId(null);

      expect(store.currentRevisionId).toBeNull();
    });
  });

  describe('addComment', () => {
    it('should append a comment to the array', () => {
      const store = useCommentsStore();
      const comment = createMockComment({ id: 'c1' });

      store.addComment(comment);

      expect(store.comments).toHaveLength(1);
      expect(store.comments[0]).toEqual(comment);
    });

    it('should append to existing comments', () => {
      const store = useCommentsStore();
      store.addComment(createMockComment({ id: 'c1' }));

      store.addComment(createMockComment({ id: 'c2' }));

      expect(store.comments).toHaveLength(2);
      expect(store.comments[1].id).toBe('c2');
    });
  });

  describe('updateComment', () => {
    it('should update a comment by id', () => {
      const store = useCommentsStore();
      store.setComments([
        createMockComment({ id: 'c1', body: 'original' }),
        createMockComment({ id: 'c2', body: 'other' }),
      ]);

      store.updateComment('c1', createMockComment({ id: 'c1', body: 'updated' }));

      expect(store.comments[0].body).toBe('updated');
      expect(store.comments[1].body).toBe('other');
    });

    it('should not modify comments when id is not found', () => {
      const store = useCommentsStore();
      store.setComments([createMockComment({ id: 'c1', body: 'original' })]);

      store.updateComment('nonexistent', createMockComment({ id: 'nonexistent', body: 'new' }));

      expect(store.comments).toHaveLength(1);
      expect(store.comments[0].body).toBe('original');
    });
  });

  describe('removeComment', () => {
    it('should remove a comment by id', () => {
      const store = useCommentsStore();
      store.setComments([createMockComment({ id: 'c1' }), createMockComment({ id: 'c2' })]);

      store.removeComment('c1');

      expect(store.comments).toHaveLength(1);
      expect(store.comments[0].id).toBe('c2');
    });

    it('should do nothing when id is not found', () => {
      const store = useCommentsStore();
      store.setComments([createMockComment({ id: 'c1' })]);

      store.removeComment('nonexistent');

      expect(store.comments).toHaveLength(1);
    });
  });

  describe('clearComments', () => {
    it('should reset comments to empty array', () => {
      const store = useCommentsStore();
      store.setComments([createMockComment({ id: 'c1' })]);

      store.clearComments();

      expect(store.comments).toEqual([]);
    });

    it('should reset currentRevisionId to null', () => {
      const store = useCommentsStore();
      store.setCurrentRevisionId('rev-1');
      store.setComments([createMockComment({ id: 'c1' })]);

      store.clearComments();

      expect(store.currentRevisionId).toBeNull();
    });
  });

  describe('generalComments', () => {
    it('should return comments with null lineNumber and null parentId', () => {
      const store = useCommentsStore();
      store.setComments([
        createMockComment({ id: 'general', lineNumber: null, parentId: null }),
        createMockComment({ id: 'inline', lineNumber: 5, parentId: null }),
        createMockComment({ id: 'reply', lineNumber: null, parentId: 'general' }),
      ]);

      expect(store.generalComments).toHaveLength(1);
      expect(store.generalComments[0].id).toBe('general');
    });

    it('should return empty array when no general comments exist', () => {
      const store = useCommentsStore();
      store.setComments([createMockComment({ id: 'inline', lineNumber: 10, parentId: null })]);

      expect(store.generalComments).toEqual([]);
    });
  });

  describe('commentTree', () => {
    it('should build a tree from flat general comments', () => {
      const store = useCommentsStore();
      store.setComments([
        createMockComment({ id: 'root1', lineNumber: null, parentId: null }),
        createMockComment({ id: 'child1', lineNumber: null, parentId: 'root1' }),
        createMockComment({ id: 'root2', lineNumber: null, parentId: null }),
      ]);

      const tree = store.commentTree;

      expect(tree).toHaveLength(2);
      expect(tree[0].id).toBe('root1');
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].id).toBe('child1');
      expect(tree[1].id).toBe('root2');
      expect(tree[1].children).toHaveLength(0);
    });

    it('should build multi-level nesting', () => {
      const store = useCommentsStore();
      store.setComments([
        createMockComment({ id: 'root', lineNumber: null, parentId: null }),
        createMockComment({ id: 'child', lineNumber: null, parentId: 'root' }),
        createMockComment({ id: 'grandchild', lineNumber: null, parentId: 'child' }),
      ]);

      const tree = store.commentTree;

      expect(tree).toHaveLength(1);
      expect(tree[0].children).toHaveLength(1);
      expect(tree[0].children[0].children).toHaveLength(1);
      expect(tree[0].children[0].children[0].id).toBe('grandchild');
    });

    it('should exclude inline comments from tree', () => {
      const store = useCommentsStore();
      store.setComments([
        createMockComment({ id: 'general', lineNumber: null, parentId: null }),
        createMockComment({ id: 'inline', lineNumber: 5, parentId: null }),
      ]);

      const tree = store.commentTree;

      expect(tree).toHaveLength(1);
      expect(tree[0].id).toBe('general');
    });

    it('should return empty array when no general comments exist', () => {
      const store = useCommentsStore();
      store.setComments([createMockComment({ id: 'inline', lineNumber: 5, parentId: null })]);

      expect(store.commentTree).toEqual([]);
    });
  });

  describe('inlineComments', () => {
    it('should group inline comments by line number for the current revision', () => {
      const store = useCommentsStore();
      store.setCurrentRevisionId('rev-1');
      store.setComments([
        createMockComment({ id: 'c1', lineNumber: 5, parentId: null, revisionId: 'rev-1' }),
        createMockComment({ id: 'c2', lineNumber: 5, parentId: null, revisionId: 'rev-1' }),
        createMockComment({ id: 'c3', lineNumber: 10, parentId: null, revisionId: 'rev-1' }),
      ]);

      const grouped = store.inlineComments;

      expect(grouped.size).toBe(2);
      const line5 = grouped.get(5) ?? [];
      expect(line5).toHaveLength(2);
      expect(line5[0].id).toBe('c1');
      expect(line5[1].id).toBe('c2');
      const line10 = grouped.get(10) ?? [];
      expect(line10).toHaveLength(1);
      expect(line10[0].id).toBe('c3');
    });

    it('should exclude comments from other revisions', () => {
      const store = useCommentsStore();
      store.setCurrentRevisionId('rev-2');
      store.setComments([
        createMockComment({ id: 'c1', lineNumber: 5, parentId: null, revisionId: 'rev-1' }),
        createMockComment({ id: 'c2', lineNumber: 5, parentId: null, revisionId: 'rev-2' }),
      ]);

      const grouped = store.inlineComments;

      expect(grouped.size).toBe(1);
      const line5 = grouped.get(5) ?? [];
      expect(line5).toHaveLength(1);
      expect(line5[0].id).toBe('c2');
    });

    it('should exclude general comments', () => {
      const store = useCommentsStore();
      store.setCurrentRevisionId('rev-1');
      store.setComments([
        createMockComment({ id: 'general', lineNumber: null, parentId: null, revisionId: 'rev-1' }),
        createMockComment({ id: 'inline', lineNumber: 5, parentId: null, revisionId: 'rev-1' }),
      ]);

      const grouped = store.inlineComments;

      expect(grouped.size).toBe(1);
      expect(grouped.has(5)).toBe(true);
    });

    it('should exclude reply comments (non-null parentId)', () => {
      const store = useCommentsStore();
      store.setCurrentRevisionId('rev-1');
      store.setComments([
        createMockComment({ id: 'c1', lineNumber: 5, parentId: null, revisionId: 'rev-1' }),
        createMockComment({ id: 'c2', lineNumber: 5, parentId: 'c1', revisionId: 'rev-1' }),
      ]);

      const grouped = store.inlineComments;

      const line5 = grouped.get(5) ?? [];
      expect(line5).toHaveLength(1);
      expect(line5[0].id).toBe('c1');
    });

    it('should return empty map when no inline comments exist', () => {
      const store = useCommentsStore();
      store.setCurrentRevisionId('rev-1');
      store.setComments([createMockComment({ id: 'general', lineNumber: null, parentId: null })]);

      expect(store.inlineComments.size).toBe(0);
    });
  });

  describe('staleComments', () => {
    it('should return inline comments from older revisions', () => {
      const store = useCommentsStore();
      store.setCurrentRevisionId('rev-2');
      store.setComments([
        createMockComment({ id: 'stale', lineNumber: 5, parentId: null, revisionId: 'rev-1' }),
        createMockComment({ id: 'current', lineNumber: 5, parentId: null, revisionId: 'rev-2' }),
      ]);

      expect(store.staleComments).toHaveLength(1);
      expect(store.staleComments[0].id).toBe('stale');
    });

    it('should exclude general comments', () => {
      const store = useCommentsStore();
      store.setCurrentRevisionId('rev-2');
      store.setComments([
        createMockComment({ id: 'general', lineNumber: null, parentId: null, revisionId: 'rev-1' }),
        createMockComment({
          id: 'stale-inline',
          lineNumber: 5,
          parentId: null,
          revisionId: 'rev-1',
        }),
      ]);

      expect(store.staleComments).toHaveLength(1);
      expect(store.staleComments[0].id).toBe('stale-inline');
    });

    it('should exclude reply comments', () => {
      const store = useCommentsStore();
      store.setCurrentRevisionId('rev-2');
      store.setComments([
        createMockComment({ id: 'stale-root', lineNumber: 5, parentId: null, revisionId: 'rev-1' }),
        createMockComment({
          id: 'stale-reply',
          lineNumber: 5,
          parentId: 'stale-root',
          revisionId: 'rev-1',
        }),
      ]);

      expect(store.staleComments).toHaveLength(1);
      expect(store.staleComments[0].id).toBe('stale-root');
    });

    it('should exclude comments with null revisionId', () => {
      const store = useCommentsStore();
      store.setCurrentRevisionId('rev-1');
      store.setComments([
        createMockComment({ id: 'no-rev', lineNumber: 5, parentId: null, revisionId: null }),
      ]);

      expect(store.staleComments).toHaveLength(0);
    });

    it('should return empty array when all inline comments match current revision', () => {
      const store = useCommentsStore();
      store.setCurrentRevisionId('rev-1');
      store.setComments([
        createMockComment({ id: 'c1', lineNumber: 5, parentId: null, revisionId: 'rev-1' }),
      ]);

      expect(store.staleComments).toHaveLength(0);
    });
  });
});
