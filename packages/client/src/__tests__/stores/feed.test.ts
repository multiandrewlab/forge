import { describe, it, expect, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useFeedStore } from '../../stores/feed.js';
import type { PostWithAuthor } from '@forge/shared';

const mockPost: PostWithAuthor = {
  id: '1',
  authorId: 'u1',
  title: 'Test',
  contentType: 'snippet',
  language: 'ts',
  visibility: 'public',
  isDraft: false,
  forkedFromId: null,
  linkUrl: null,
  linkPreview: null,
  voteCount: 5,
  viewCount: 10,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: 'u1', displayName: 'Test', avatarUrl: null },
  tags: [],
};

describe('useFeedStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('initializes with empty posts and default sort', () => {
    const store = useFeedStore();
    expect(store.posts).toEqual([]);
    expect(store.sort).toBe('recent');
    expect(store.selectedPostId).toBeNull();
    expect(store.cursor).toBeNull();
    expect(store.filter).toBeNull();
    expect(store.tag).toBeNull();
    expect(store.contentType).toBeNull();
  });

  it('setPosts replaces posts array', () => {
    const store = useFeedStore();
    store.setPosts([mockPost]);
    expect(store.posts).toEqual([mockPost]);
  });

  it('appendPosts adds to existing posts', () => {
    const store = useFeedStore();
    store.setPosts([mockPost]);
    const post2 = { ...mockPost, id: '2' };
    store.appendPosts([post2]);
    expect(store.posts).toHaveLength(2);
  });

  it('hasMore is derived from cursor', () => {
    const store = useFeedStore();
    expect(store.hasMore).toBe(false);
    store.setCursor('abc');
    expect(store.hasMore).toBe(true);
    store.setCursor(null);
    expect(store.hasMore).toBe(false);
  });

  it('setSort updates sort', () => {
    const store = useFeedStore();
    store.setSort('trending');
    expect(store.sort).toBe('trending');
  });

  it('setFilter updates filter', () => {
    const store = useFeedStore();
    store.setFilter('mine');
    expect(store.filter).toBe('mine');
  });

  it('setTag updates tag', () => {
    const store = useFeedStore();
    store.setTag('frontend');
    expect(store.tag).toBe('frontend');
  });

  it('setContentType updates contentType', () => {
    const store = useFeedStore();
    store.setContentType('snippet');
    expect(store.contentType).toBe('snippet');
  });

  it('setSelectedPostId updates selectedPostId', () => {
    const store = useFeedStore();
    store.setSelectedPostId('post-1');
    expect(store.selectedPostId).toBe('post-1');
  });

  it('reset clears all state', () => {
    const store = useFeedStore();
    store.setPosts([mockPost]);
    store.setSort('trending');
    store.setFilter('mine');
    store.setCursor('abc');
    store.reset();
    expect(store.posts).toEqual([]);
    expect(store.sort).toBe('recent');
    expect(store.filter).toBeNull();
    expect(store.cursor).toBeNull();
  });

  describe('userVotes', () => {
    it('initializes as empty object', () => {
      const store = useFeedStore();
      expect(store.userVotes).toEqual({});
    });

    it('updatePostVote sets vote and updates post voteCount', () => {
      const store = useFeedStore();
      store.setPosts([mockPost]);
      store.updatePostVote('1', 10, 1);
      expect(store.userVotes['1']).toBe(1);
      expect(store.posts[0].voteCount).toBe(10);
    });

    it('updatePostVote removes entry when userVote is null', () => {
      const store = useFeedStore();
      store.setPosts([mockPost]);
      store.updatePostVote('1', 10, 1);
      expect(store.userVotes['1']).toBe(1);
      store.updatePostVote('1', 5, null);
      expect(store.userVotes['1']).toBeUndefined();
      expect(store.posts[0].voteCount).toBe(5);
    });

    it('updatePostVote handles non-existent postId gracefully', () => {
      const store = useFeedStore();
      store.setPosts([mockPost]);
      store.updatePostVote('nonexistent', 10, 1);
      expect(store.userVotes['nonexistent']).toBe(1);
      // post array unchanged
      expect(store.posts[0].voteCount).toBe(5);
    });
  });

  describe('userBookmarks', () => {
    it('initializes as empty object', () => {
      const store = useFeedStore();
      expect(store.userBookmarks).toEqual({});
    });

    it('setBookmark sets bookmarked state to true', () => {
      const store = useFeedStore();
      store.setBookmark('1', true);
      expect(store.userBookmarks['1']).toBe(true);
    });

    it('setBookmark removes entry when bookmarked is false', () => {
      const store = useFeedStore();
      store.setBookmark('1', true);
      expect(store.userBookmarks['1']).toBe(true);
      store.setBookmark('1', false);
      expect(store.userBookmarks['1']).toBeUndefined();
    });
  });

  it('reset clears userVotes and userBookmarks', () => {
    const store = useFeedStore();
    store.setPosts([mockPost]);
    store.updatePostVote('1', 10, 1);
    store.setBookmark('1', true);
    store.reset();
    expect(store.userVotes).toEqual({});
    expect(store.userBookmarks).toEqual({});
  });
});
