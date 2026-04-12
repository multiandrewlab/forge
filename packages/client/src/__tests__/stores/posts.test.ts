import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { usePostsStore } from '@/stores/posts';
import type { PostWithRevision } from '@forge/shared';
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

describe('usePostsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  describe('initial state', () => {
    it('should have null currentPost by default', () => {
      const store = usePostsStore();
      expect(store.currentPost).toBeNull();
    });

    it('should have isDirty as false by default', () => {
      const store = usePostsStore();
      expect(store.isDirty).toBe(false);
    });

    it('should have saveStatus as "unsaved" by default', () => {
      const store = usePostsStore();
      expect(store.saveStatus).toBe('unsaved');
    });

    it('should have null lastSavedAt by default', () => {
      const store = usePostsStore();
      expect(store.lastSavedAt).toBeNull();
    });
  });

  describe('setPost', () => {
    it('should set currentPost', () => {
      const store = usePostsStore();
      const post = createMockPost();

      store.setPost(post);

      expect(store.currentPost).toEqual(post);
    });

    it('should set currentPost to null', () => {
      const store = usePostsStore();
      store.setPost(createMockPost());

      store.setPost(null);

      expect(store.currentPost).toBeNull();
    });
  });

  describe('setDirty', () => {
    it('should set isDirty to true', () => {
      const store = usePostsStore();

      store.setDirty(true);

      expect(store.isDirty).toBe(true);
    });

    it('should set isDirty to false', () => {
      const store = usePostsStore();
      store.setDirty(true);

      store.setDirty(false);

      expect(store.isDirty).toBe(false);
    });

    it('should set saveStatus to "unsaved" when setting dirty to true', () => {
      const store = usePostsStore();
      store.setSaveStatus('saved');

      store.setDirty(true);

      expect(store.saveStatus).toBe('unsaved');
    });

    it('should not change saveStatus when setting dirty to false', () => {
      const store = usePostsStore();
      store.setSaveStatus('saved');

      store.setDirty(false);

      expect(store.saveStatus).toBe('saved');
    });
  });

  describe('setSaveStatus', () => {
    it('should set saveStatus to "saving"', () => {
      const store = usePostsStore();

      store.setSaveStatus('saving');

      expect(store.saveStatus).toBe('saving');
    });

    it('should set saveStatus to "error"', () => {
      const store = usePostsStore();

      store.setSaveStatus('error');

      expect(store.saveStatus).toBe('error');
    });

    it('should set lastSavedAt and isDirty to false when status is "saved"', () => {
      const store = usePostsStore();
      store.setDirty(true);
      const before = new Date();

      store.setSaveStatus('saved');

      expect(store.saveStatus).toBe('saved');
      expect(store.isDirty).toBe(false);
      expect(store.lastSavedAt).not.toBeNull();
      const savedAt = store.lastSavedAt as Date;
      expect(savedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
    });

    it('should not set lastSavedAt when status is not "saved"', () => {
      const store = usePostsStore();

      store.setSaveStatus('saving');

      expect(store.lastSavedAt).toBeNull();
    });

    it('should set saveStatus to "unsaved"', () => {
      const store = usePostsStore();
      store.setSaveStatus('saved');

      store.setSaveStatus('unsaved');

      expect(store.saveStatus).toBe('unsaved');
    });
  });

  describe('clearPost', () => {
    it('should reset all state to initial values', () => {
      const store = usePostsStore();

      // Set up non-default state
      store.setPost(createMockPost());
      store.setDirty(true);
      store.setSaveStatus('saved');

      store.clearPost();

      expect(store.currentPost).toBeNull();
      expect(store.isDirty).toBe(false);
      expect(store.saveStatus).toBe('unsaved');
      expect(store.lastSavedAt).toBeNull();
    });

    it('should reset isDirty after it was set to true', () => {
      const store = usePostsStore();
      store.setDirty(true);

      store.clearPost();

      expect(store.isDirty).toBe(false);
    });

    it('should reset lastSavedAt after it was set', () => {
      const store = usePostsStore();
      store.setSaveStatus('saved');
      expect(store.lastSavedAt).not.toBeNull();

      store.clearPost();

      expect(store.lastSavedAt).toBeNull();
    });
  });
});
