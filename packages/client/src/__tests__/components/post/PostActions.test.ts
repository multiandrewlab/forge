import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useFeedStore } from '../../../stores/feed.js';
import PostActions from '../../../components/post/PostActions.vue';
import type { PostWithAuthor } from '@forge/shared';

const mockVote = vi.fn();
const mockRemoveVote = vi.fn();
const mockToggleBookmark = vi.fn();

vi.mock('../../../composables/useVotes.js', () => ({
  useVotes: () => ({
    vote: mockVote,
    removeVote: mockRemoveVote,
    loading: { value: false },
    error: { value: null },
  }),
}));

vi.mock('../../../composables/useBookmarks.js', () => ({
  useBookmarks: () => ({
    toggleBookmark: mockToggleBookmark,
    loading: { value: false },
    error: { value: null },
  }),
}));

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

describe('PostActions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockVote.mockReset();
    mockRemoveVote.mockReset();
    mockToggleBookmark.mockReset();
  });

  it('renders 5 buttons', () => {
    const wrapper = mount(PostActions, {
      props: { post: mockPost },
    });
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(5);
  });

  it('displays vote count on upvote button', () => {
    const wrapper = mount(PostActions, {
      props: { post: mockPost },
    });
    const upvoteBtn = wrapper.find('[aria-label="Upvote"]');
    expect(upvoteBtn.text()).toContain('5');
  });

  describe('upvote button', () => {
    it('calls vote(postId, 1) when not voted', async () => {
      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const upvoteBtn = wrapper.find('[aria-label="Upvote"]');
      await upvoteBtn.trigger('click');
      expect(mockVote).toHaveBeenCalledWith('1', 1);
    });

    it('calls removeVote when already upvoted', async () => {
      const store = useFeedStore();
      store.updatePostVote('1', 6, 1);

      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const upvoteBtn = wrapper.find('[aria-label="Upvote"]');
      await upvoteBtn.trigger('click');
      expect(mockRemoveVote).toHaveBeenCalledWith('1');
    });

    it('has text-primary class when upvoted', () => {
      const store = useFeedStore();
      store.updatePostVote('1', 6, 1);

      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const upvoteBtn = wrapper.find('[aria-label="Upvote"]');
      expect(upvoteBtn.classes()).toContain('text-primary');
    });

    it('does not have text-primary class when not voted', () => {
      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const upvoteBtn = wrapper.find('[aria-label="Upvote"]');
      expect(upvoteBtn.classes()).not.toContain('text-primary');
    });
  });

  describe('downvote button', () => {
    it('calls vote(postId, -1) when not voted', async () => {
      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const downvoteBtn = wrapper.find('[aria-label="Downvote"]');
      await downvoteBtn.trigger('click');
      expect(mockVote).toHaveBeenCalledWith('1', -1);
    });

    it('calls removeVote when already downvoted', async () => {
      const store = useFeedStore();
      store.updatePostVote('1', 4, -1);

      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const downvoteBtn = wrapper.find('[aria-label="Downvote"]');
      await downvoteBtn.trigger('click');
      expect(mockRemoveVote).toHaveBeenCalledWith('1');
    });

    it('has text-red-400 class when downvoted', () => {
      const store = useFeedStore();
      store.updatePostVote('1', 4, -1);

      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const downvoteBtn = wrapper.find('[aria-label="Downvote"]');
      expect(downvoteBtn.classes()).toContain('text-red-400');
    });

    it('does not have text-red-400 class when not voted', () => {
      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const downvoteBtn = wrapper.find('[aria-label="Downvote"]');
      expect(downvoteBtn.classes()).not.toContain('text-red-400');
    });
  });

  describe('bookmark button', () => {
    it('calls toggleBookmark on click', async () => {
      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const bookmarkBtn = wrapper.find('[aria-label="Bookmark"]');
      await bookmarkBtn.trigger('click');
      expect(mockToggleBookmark).toHaveBeenCalledWith('1');
    });

    it('has text-yellow-400 class when bookmarked', () => {
      const store = useFeedStore();
      store.setBookmark('1', true);

      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const bookmarkBtn = wrapper.find('[aria-label="Bookmark"]');
      expect(bookmarkBtn.classes()).toContain('text-yellow-400');
    });

    it('does not have text-yellow-400 class when not bookmarked', () => {
      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const bookmarkBtn = wrapper.find('[aria-label="Bookmark"]');
      expect(bookmarkBtn.classes()).not.toContain('text-yellow-400');
    });
  });

  describe('fork button', () => {
    it('is disabled', () => {
      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const forkBtn = wrapper.find('[aria-label="Fork"]');
      expect(forkBtn.attributes('disabled')).toBeDefined();
    });

    it('has text-gray-500 class', () => {
      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const forkBtn = wrapper.find('[aria-label="Fork"]');
      expect(forkBtn.classes()).toContain('text-gray-500');
    });
  });

  describe('history button', () => {
    it('is disabled', () => {
      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const historyBtn = wrapper.find('[aria-label="History"]');
      expect(historyBtn.attributes('disabled')).toBeDefined();
    });

    it('has text-gray-500 class', () => {
      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const historyBtn = wrapper.find('[aria-label="History"]');
      expect(historyBtn.classes()).toContain('text-gray-500');
    });
  });
});
