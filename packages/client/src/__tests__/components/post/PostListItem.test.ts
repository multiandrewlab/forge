import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, RouterLinkStub } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { useFeedStore } from '../../../stores/feed.js';
import PostListItem from '../../../components/post/PostListItem.vue';
import type { PostWithAuthor } from '@forge/shared';

const mockToggleBookmark = vi.fn();

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
  forkCount: 0,
  forkedFromTitle: null,
};

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/posts/:id', component: { template: '<div />' } },
      { path: '/user/:id', name: 'user-profile', component: { template: '<div />' } },
      { path: '/tags/:name', name: 'tag-view', component: { template: '<div />' } },
    ],
  });
}

describe('PostListItem', () => {
  beforeEach(() => {
    // Pinia must be active before mounting — the component's <script setup>
    // calls useFeedStore() at composition time for the new bookmark wiring.
    setActivePinia(createPinia());
    mockToggleBookmark.mockClear();
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

  it('shows draft badge with data-testid="draft-badge" when isDraft is true', () => {
    const router = createTestRouter();
    const draftPost = { ...mockPost, isDraft: true };
    const wrapper = mount(PostListItem, {
      props: { post: draftPost, selected: false },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain('Draft');
    expect(wrapper.find('[data-testid="draft-badge"]').exists()).toBe(true);
  });

  it('does not render draft-badge when isDraft is false', () => {
    const router = createTestRouter();
    const wrapper = mount(PostListItem, {
      props: { post: mockPost, selected: false },
      global: { plugins: [router] },
    });
    expect(wrapper.find('[data-testid="draft-badge"]').exists()).toBe(false);
  });

  it('renders the root element with data-testid="post-list-item" for E2E row scoping', () => {
    const router = createTestRouter();
    const wrapper = mount(PostListItem, {
      props: { post: mockPost, selected: false },
      global: { plugins: [router] },
    });
    expect(wrapper.find('[data-testid="post-list-item"]').exists()).toBe(true);
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

  it('shows fork count when forkCount > 0', () => {
    const router = createTestRouter();
    const forkedPost = { ...mockPost, forkCount: 3 };
    const wrapper = mount(PostListItem, {
      props: { post: forkedPost, selected: false },
      global: { plugins: [router] },
    });

    expect(wrapper.find('[data-testid="fork-count"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('3');
  });

  it('does not show fork count when forkCount is 0', () => {
    const router = createTestRouter();
    const wrapper = mount(PostListItem, {
      props: { post: mockPost, selected: false },
      global: { plugins: [router] },
    });

    expect(wrapper.find('[data-testid="fork-count"]').exists()).toBe(false);
  });

  describe('link icon', () => {
    it('shows link icon when contentType is "link"', () => {
      const router = createTestRouter();
      const linkPost = { ...mockPost, contentType: 'link' as const };
      const wrapper = mount(PostListItem, {
        props: { post: linkPost, selected: false },
        global: { plugins: [router] },
      });
      expect(wrapper.find('[data-testid="link-icon"]').exists()).toBe(true);
    });

    it('does not show link icon when contentType is "snippet"', () => {
      const router = createTestRouter();
      const wrapper = mount(PostListItem, {
        props: { post: mockPost, selected: false },
        global: { plugins: [router] },
      });
      expect(wrapper.find('[data-testid="link-icon"]').exists()).toBe(false);
    });
  });

  describe('video icon', () => {
    it('shows video icon when contentType is "video"', () => {
      const router = createTestRouter();
      const videoPost = { ...mockPost, contentType: 'video' as const };
      const wrapper = mount(PostListItem, {
        props: { post: videoPost, selected: false },
        global: { plugins: [router] },
      });
      expect(wrapper.find('[data-testid="video-icon"]').exists()).toBe(true);
    });

    it('does not show video icon when contentType is "snippet"', () => {
      const router = createTestRouter();
      const wrapper = mount(PostListItem, {
        props: { post: mockPost, selected: false },
        global: { plugins: [router] },
      });
      expect(wrapper.find('[data-testid="video-icon"]').exists()).toBe(false);
    });
  });

  describe('author profile link', () => {
    it('wraps author avatar and name in a RouterLink to user profile', () => {
      const router = createTestRouter();
      const wrapper = mount(PostListItem, {
        props: { post: mockPost, selected: false },
        global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } },
      });

      const link = wrapper.findComponent(RouterLinkStub);
      expect(link.exists()).toBe(true);
      expect(link.props('to')).toEqual({
        name: 'user-profile',
        params: { id: 'u1' },
      });
    });

    it('renders author avatar initial inside the profile link', () => {
      const router = createTestRouter();
      const wrapper = mount(PostListItem, {
        props: { post: mockPost, selected: false },
        global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } },
      });

      const link = wrapper.findComponent(RouterLinkStub);
      expect(link.text()).toContain('T');
      expect(link.text()).toContain('Test User');
    });

    it('stops click propagation so parent click handler is not triggered', async () => {
      const router = createTestRouter();
      const wrapper = mount(PostListItem, {
        props: { post: mockPost, selected: false },
        global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } },
      });

      const link = wrapper.findComponent(RouterLinkStub);
      await link.trigger('click');

      // The parent click handler should NOT fire (no select emitted, no navigation)
      expect(wrapper.emitted('select')).toBeFalsy();
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

  describe('per-card bookmark toggle', () => {
    it('renders bookmark-on-icon when feedStore.userBookmarks[post.id] is true', () => {
      setActivePinia(createPinia());
      const store = useFeedStore();
      store.userBookmarks[mockPost.id] = true;
      const router = createTestRouter();
      const wrapper = mount(PostListItem, {
        props: { post: mockPost, selected: false },
        global: { plugins: [router] },
      });
      expect(wrapper.find('[data-testid="post-list-item-bookmark-on-icon"]').exists()).toBe(true);
    });

    it('does NOT render bookmark-on-icon when bookmark is absent', () => {
      const router = createTestRouter();
      const wrapper = mount(PostListItem, {
        props: { post: mockPost, selected: false },
        global: { plugins: [router] },
      });
      expect(wrapper.find('[data-testid="post-list-item-bookmark-on-icon"]').exists()).toBe(false);
    });

    it('clicking the toggle button calls useBookmarks().toggleBookmark with the post id', async () => {
      const router = createTestRouter();
      const wrapper = mount(PostListItem, {
        props: { post: mockPost, selected: false },
        global: { plugins: [router] },
      });
      await wrapper.find('[data-testid="post-list-item-bookmark-toggle-btn"]').trigger('click');
      expect(mockToggleBookmark).toHaveBeenCalledWith(mockPost.id);
    });

    it('toggle click does NOT emit select (click.stop prevents card navigation)', async () => {
      const router = createTestRouter();
      const wrapper = mount(PostListItem, {
        props: { post: mockPost, selected: false },
        global: { plugins: [router] },
      });
      await wrapper.find('[data-testid="post-list-item-bookmark-toggle-btn"]').trigger('click');
      expect(wrapper.emitted('select')).toBeFalsy();
    });
  });

  // ── Issue #49: tag chips ──────────────────────────────────────
  describe('tag chips', () => {
    it('renders post-tag-chip-<name> for each tag', () => {
      const router = createTestRouter();
      const taggedPost: PostWithAuthor = { ...mockPost, tags: ['react', 'typescript'] };
      const wrapper = mount(PostListItem, {
        props: { post: taggedPost, selected: false },
        global: { plugins: [router] },
      });
      expect(wrapper.find('[data-testid="post-tag-chip-react"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="post-tag-chip-typescript"]').exists()).toBe(true);
    });

    it('does NOT render any tag chips when post.tags is empty', () => {
      const router = createTestRouter();
      const wrapper = mount(PostListItem, {
        props: { post: mockPost, selected: false },
        global: { plugins: [router] },
      });
      expect(wrapper.find('[data-testid^="post-tag-chip-"]').exists()).toBe(false);
    });

    it('each tag chip is a RouterLink to /tags/:name', () => {
      const router = createTestRouter();
      const taggedPost: PostWithAuthor = { ...mockPost, tags: ['react'] };
      const wrapper = mount(PostListItem, {
        props: { post: taggedPost, selected: false },
        global: { plugins: [router], stubs: { RouterLink: RouterLinkStub } },
      });
      const chip = wrapper.find('[data-testid="post-tag-chip-react"]');
      expect(chip.exists()).toBe(true);
      const link = chip.getComponent(RouterLinkStub);
      expect(link.props('to')).toEqual({ name: 'tag-view', params: { name: 'react' } });
    });

    it('tag chip click does NOT emit select (click.stop prevents card navigation)', async () => {
      const router = createTestRouter();
      const taggedPost: PostWithAuthor = { ...mockPost, tags: ['react'] };
      const wrapper = mount(PostListItem, {
        props: { post: taggedPost, selected: false },
        global: { plugins: [router] },
      });
      await wrapper.find('[data-testid="post-tag-chip-react"]').trigger('click');
      expect(wrapper.emitted('select')).toBeFalsy();
    });
  });
});
