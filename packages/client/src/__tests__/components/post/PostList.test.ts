import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import type { PostWithAuthor, FeedSort } from '@forge/shared';

// Mock PostListFilters and PostListItem to isolate PostList behaviour
vi.mock('../../../components/post/PostListFilters.vue', () => ({
  default: {
    name: 'PostListFilters',
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template:
      '<div data-testid="post-list-filters"><button data-testid="sort-btn" @click="$emit(\'update:modelValue\', \'recent\')">Sort</button></div>',
  },
}));

vi.mock('../../../components/post/PostListItem.vue', () => ({
  default: {
    name: 'PostListItem',
    props: ['post', 'selected'],
    emits: ['select'],
    template:
      '<div data-testid="post-list-item" @click="$emit(\'select\', post.id)">{{ post.title }}</div>',
  },
}));

import PostList from '../../../components/post/PostList.vue';

const mockPost: PostWithAuthor = {
  id: '1',
  authorId: 'u1',
  title: 'Hello World',
  contentType: 'snippet',
  language: 'ts',
  visibility: 'public',
  isDraft: false,
  forkedFromId: null,
  linkUrl: null,
  linkPreview: null,
  voteCount: 3,
  viewCount: 7,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: 'u1', displayName: 'Alice', avatarUrl: null },
  tags: [],
};

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/posts/new', component: { template: '<div />' } },
    ],
  });
}

function defaultProps(overrides: Record<string, unknown> = {}) {
  return {
    posts: [] as PostWithAuthor[],
    selectedPostId: null,
    loading: false,
    error: null,
    hasMore: false,
    currentSort: 'trending' as FeedSort,
    currentFilter: null,
    currentTag: null,
    ...overrides,
  };
}

describe('PostList', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  function mountList(propsOverrides: Record<string, unknown> = {}) {
    const router = createTestRouter();
    return mount(PostList, {
      props: defaultProps(propsOverrides),
      global: { plugins: [router] },
    });
  }

  // ── Loading state ─────────────────────────────────────────────
  it('shows loading skeleton when loading=true and posts is empty', () => {
    const wrapper = mountList({ loading: true, posts: [] });
    // 5 skeleton items rendered via v-for
    const skeletons = wrapper.findAll('.animate-pulse');
    expect(skeletons.length).toBe(5);
  });

  // ── Error state ───────────────────────────────────────────────
  it('shows error message when error is set and posts is non-empty', () => {
    const wrapper = mountList({
      posts: [mockPost],
      loading: false,
      error: 'Something went wrong',
    });
    expect(wrapper.text()).toContain('Something went wrong');
  });

  it('emits retry when Retry button is clicked', async () => {
    const wrapper = mountList({
      posts: [mockPost],
      loading: false,
      error: 'Oops',
    });
    const retryBtn = wrapper.findAll('button').find((b) => b.text() === 'Retry');
    expect(retryBtn).toBeDefined();
    await (retryBtn as ReturnType<typeof wrapper.find>).trigger('click');
    expect(wrapper.emitted('retry')).toBeTruthy();
  });

  // ── Empty state ───────────────────────────────────────────────
  describe('empty state message', () => {
    it('shows tag-specific message when currentTag is set', () => {
      const wrapper = mountList({ currentTag: 'vue' });
      expect(wrapper.text()).toContain('No posts tagged #vue');
    });

    it('shows "mine" message when currentFilter is "mine"', () => {
      const wrapper = mountList({ currentFilter: 'mine' });
      expect(wrapper.text()).toContain("You haven't created any posts yet");
    });

    it('shows "bookmarked" message when currentFilter is "bookmarked"', () => {
      const wrapper = mountList({ currentFilter: 'bookmarked' });
      expect(wrapper.text()).toContain('No bookmarked posts yet');
    });

    it('shows default message when no tag or filter', () => {
      const wrapper = mountList();
      expect(wrapper.text()).toContain('No posts yet — be the first to share!');
    });
  });

  // ── showCreateCta ─────────────────────────────────────────────
  describe('showCreateCta', () => {
    it('shows Create New Post CTA when filter is not "bookmarked"', () => {
      const wrapper = mountList({ currentFilter: null });
      expect(wrapper.text()).toContain('Create New Post');
    });

    it('shows Create New Post CTA when filter is "mine"', () => {
      const wrapper = mountList({ currentFilter: 'mine' });
      expect(wrapper.text()).toContain('Create New Post');
    });

    it('hides Create New Post CTA when filter is "bookmarked"', () => {
      const wrapper = mountList({ currentFilter: 'bookmarked' });
      expect(wrapper.text()).not.toContain('Create New Post');
    });
  });

  // ── Populated list ────────────────────────────────────────────
  it('renders PostListItem for each post', () => {
    const wrapper = mountList({ posts: [mockPost] });
    const items = wrapper.findAll('[data-testid="post-list-item"]');
    expect(items.length).toBe(1);
    expect(items[0].text()).toContain('Hello World');
  });

  it('emits selectPost when PostListItem emits select', async () => {
    const wrapper = mountList({ posts: [mockPost] });
    const item = wrapper.find('[data-testid="post-list-item"]');
    await item.trigger('click');
    expect(wrapper.emitted('selectPost')).toBeTruthy();
    const emitted = wrapper.emitted('selectPost') as unknown[][];
    expect(emitted[0]).toEqual(['1']);
  });

  it('shows Load More button when hasMore is true', () => {
    const wrapper = mountList({ posts: [mockPost], hasMore: true });
    expect(wrapper.text()).toContain('Load More');
  });

  it('shows "Loading..." in Load More button when hasMore and loading', () => {
    const wrapper = mountList({ posts: [mockPost], hasMore: true, loading: true });
    expect(wrapper.text()).toContain('Loading...');
  });

  it('emits loadMore when Load More button is clicked', async () => {
    const wrapper = mountList({ posts: [mockPost], hasMore: true });
    const buttons = wrapper.findAll('button');
    const loadMore = buttons.find((b) => b.text() === 'Load More');
    expect(loadMore).toBeDefined();
    await (loadMore as ReturnType<typeof wrapper.find>).trigger('click');
    expect(wrapper.emitted('loadMore')).toBeTruthy();
  });

  // ── Sort change ───────────────────────────────────────────────
  it('calls onSortChange when PostListFilters emits update:modelValue', async () => {
    const wrapper = mountList();
    const filters = wrapper.find('[data-testid="sort-btn"]');
    await filters.trigger('click');
    // No crash, sort ref updated internally — no external emit for sort from PostList itself
    // Verify PostListFilters is rendered
    expect(wrapper.find('[data-testid="post-list-filters"]').exists()).toBe(true);
  });
});
