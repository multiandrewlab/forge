import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { useFeedStore } from '../../../stores/feed.js';
import PostActions from '../../../components/post/PostActions.vue';
import type { PostWithAuthor } from '@forge/shared';

const mockVote = vi.fn();
const mockRemoveVote = vi.fn();
const mockToggleBookmark = vi.fn();
const mockPush = vi.fn();

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

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

vi.mock('../../../stores/auth.js', () => ({
  useAuthStore: () => ({
    user: { id: 'u1', email: 'test@example.com', displayName: 'Test' },
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
  forkCount: 0,
  forkedFromTitle: null,
};

describe('PostActions', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockVote.mockReset();
    mockRemoveVote.mockReset();
    mockToggleBookmark.mockReset();
    mockPush.mockReset();
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
    it('is enabled for public posts by other users', () => {
      const otherUserPost = { ...mockPost, authorId: 'other-user' };
      const wrapper = mount(PostActions, { props: { post: otherUserPost } });

      const forkBtn = wrapper.find('[aria-label="Fork"]');
      expect(forkBtn.attributes('disabled')).toBeUndefined();
    });

    it('has hover styling when enabled', () => {
      const otherUserPost = { ...mockPost, authorId: 'other-user' };
      const wrapper = mount(PostActions, { props: { post: otherUserPost } });

      const forkBtn = wrapper.find('[aria-label="Fork"]');
      expect(forkBtn.classes()).toContain('text-gray-400');
    });

    it('is disabled for own posts', () => {
      // mockPost.authorId ('u1') matches the mocked auth user id ('u1')
      const wrapper = mount(PostActions, { props: { post: mockPost } });

      const forkBtn = wrapper.find('[aria-label="Fork"]');
      expect(forkBtn.attributes('disabled')).toBeDefined();
    });

    it('has cursor-not-allowed class for own posts', () => {
      const wrapper = mount(PostActions, { props: { post: mockPost } });

      const forkBtn = wrapper.find('[aria-label="Fork"]');
      expect(forkBtn.classes()).toContain('cursor-not-allowed');
    });

    it('emits fork event when clicked on enabled state', async () => {
      const otherUserPost = { ...mockPost, authorId: 'other-user' };
      const wrapper = mount(PostActions, { props: { post: otherUserPost } });

      await wrapper.find('[aria-label="Fork"]').trigger('click');

      expect(wrapper.emitted('fork')).toBeTruthy();
    });

    it('does not emit fork event when clicked on disabled state', async () => {
      const wrapper = mount(PostActions, { props: { post: mockPost } });

      await wrapper.find('[aria-label="Fork"]').trigger('click');

      expect(wrapper.emitted('fork')).toBeFalsy();
    });
  });

  describe('history button', () => {
    it('is not disabled', () => {
      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const historyBtn = wrapper.find('[aria-label="History"]');
      expect(historyBtn.attributes('disabled')).toBeUndefined();
    });

    it('has text-gray-400 class', () => {
      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const historyBtn = wrapper.find('[aria-label="History"]');
      expect(historyBtn.classes()).toContain('text-gray-400');
    });

    it('navigates to post-history route on click', async () => {
      const wrapper = mount(PostActions, {
        props: { post: mockPost },
      });
      const historyBtn = wrapper.find('[aria-label="History"]');
      await historyBtn.trigger('click');
      expect(mockPush).toHaveBeenCalledWith({
        name: 'post-history',
        params: { id: '1' },
      });
    });
  });
});
