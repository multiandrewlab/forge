import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useFeedStore } from '../../../stores/feed.js';
import PostListItem from '../../../components/post/PostListItem.vue';
import type { PostWithAuthor } from '@forge/shared';

const mockPost: PostWithAuthor = {
  id: '1',
  authorId: 'u1',
  title: 'Test Post',
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
  author: { id: 'u1', displayName: 'Test User', avatarUrl: null },
  tags: [],
};

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/posts/:id', component: { template: '<div />' } },
    ],
  });
}

describe('PostListItem', () => {
  beforeEach(() => {
    // Reset matchMedia to desktop default before each test
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }), // desktop: max-width:767px does NOT match
    });
  });

  it('emits select on click (desktop)', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }), // >767px = false for max-width:767px
    });
    const router = createTestRouter();
    const wrapper = mount(PostListItem, {
      props: { post: mockPost, selected: false },
      global: { plugins: [router] },
    });
    await wrapper.trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
    const emitted = wrapper.emitted('select') as unknown[][];
    expect(emitted[0]).toEqual(['1']);
  });

  it('navigates to /posts/:id on click (mobile)', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }), // max-width:767px matches = mobile
    });
    const router = createTestRouter();
    const pushSpy = vi.spyOn(router, 'push');
    const wrapper = mount(PostListItem, {
      props: { post: mockPost, selected: false },
      global: { plugins: [router] },
    });
    await wrapper.trigger('click');
    expect(pushSpy).toHaveBeenCalledWith('/posts/1');
  });

  it('shows draft badge when isDraft is true', () => {
    const router = createTestRouter();
    const draftPost = { ...mockPost, isDraft: true };
    const wrapper = mount(PostListItem, {
      props: { post: draftPost, selected: false },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain('Draft');
  });

  // ── timeAgo branches (lines 59-64) ───────────────────────────
  describe('timeAgo display', () => {
    function postWithAge(secondsAgo: number): PostWithAuthor {
      return {
        ...mockPost,
        createdAt: new Date(Date.now() - secondsAgo * 1000),
      };
    }

    it('shows "just now" for posts created less than 60s ago', () => {
      const router = createTestRouter();
      const wrapper = mount(PostListItem, {
        props: { post: postWithAge(30), selected: false },
        global: { plugins: [router] },
      });
      expect(wrapper.text()).toContain('just now');
    });

    it('shows minutes ago for posts created between 60s and 60m ago', () => {
      const router = createTestRouter();
      const wrapper = mount(PostListItem, {
        props: { post: postWithAge(5 * 60), selected: false }, // 5 minutes ago
        global: { plugins: [router] },
      });
      expect(wrapper.text()).toContain('5m ago');
    });

    it('shows hours ago for posts created between 1h and 24h ago', () => {
      const router = createTestRouter();
      const wrapper = mount(PostListItem, {
        props: { post: postWithAge(3 * 60 * 60), selected: false }, // 3 hours ago
        global: { plugins: [router] },
      });
      expect(wrapper.text()).toContain('3h ago');
    });

    it('shows days ago for posts created more than 24h ago', () => {
      const router = createTestRouter();
      const wrapper = mount(PostListItem, {
        props: { post: postWithAge(2 * 24 * 60 * 60), selected: false }, // 2 days ago
        global: { plugins: [router] },
      });
      expect(wrapper.text()).toContain('2d ago');
    });
  });

  describe('vote count reactivity via store', () => {
    it('updates displayed vote count when store.updatePostVote is called', async () => {
      setActivePinia(createPinia());
      const store = useFeedStore();
      const reactivePost: PostWithAuthor = {
        ...mockPost,
        voteCount: 5,
      };
      store.setPosts([reactivePost]);

      const router = createTestRouter();
      const wrapper = mount(PostListItem, {
        props: { post: store.posts[0], selected: false },
        global: { plugins: [router] },
      });

      expect(wrapper.text()).toContain('5');

      store.updatePostVote('1', 42, 1);
      await wrapper.vm.$nextTick();

      expect(wrapper.text()).toContain('42');
    });
  });
});
