import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import type { UserProfileResponse } from '@forge/shared';
import type { Ref } from 'vue';

// ── Mock useUserProfile composable ───────────────────────────────────
const mockFetchProfile = vi.fn();
const mockLoadMore = vi.fn();
const mockProfile: Ref<UserProfileResponse | null> = ref(null);
const mockLoading: Ref<boolean> = ref(false);
const mockError: Ref<string | null> = ref(null);

vi.mock('../../composables/useUserProfile.js', () => ({
  useUserProfile: () => ({
    profile: mockProfile,
    loading: mockLoading,
    error: mockError,
    fetchProfile: mockFetchProfile,
    loadMore: mockLoadMore,
  }),
}));

// ── Mock child components ────────────────────────────────────────────
vi.mock('../../components/user/UserBadge.vue', () => ({
  default: {
    name: 'UserBadge',
    props: ['badge'],
    template: '<span data-testid="user-badge">{{ badge.label }}</span>',
  },
}));

vi.mock('../../components/user/UserStats.vue', () => ({
  default: {
    name: 'UserStats',
    props: ['stats'],
    template: '<div data-testid="user-stats">stats</div>',
  },
}));

import UserProfilePage from '../../pages/UserProfilePage.vue';

// ── Test data ────────────────────────────────────────────────────────
const FAKE_PROFILE: UserProfileResponse = {
  user: {
    id: 'u1',
    displayName: 'Alice',
    avatarUrl: 'https://example.com/alice.png',
    createdAt: '2024-01-15T00:00:00Z',
  },
  stats: {
    postCount: 5,
    totalVotes: 42,
    topTags: [{ tagName: 'typescript', voteSum: 10 }],
  },
  badges: [
    { type: 'top_contributor', label: '#1 Contributor', rank: 1 },
    { type: 'tag_expert', label: 'TypeScript Expert' },
  ],
  posts: [
    {
      id: 'p1',
      title: 'My Post',
      contentType: 'snippet',
      language: 'typescript',
      voteCount: 3,
      createdAt: '2024-06-01T00:00:00Z',
      tags: ['typescript'],
    },
  ],
  cursor: null,
};

const FAKE_PROFILE_NO_AVATAR: UserProfileResponse = {
  ...FAKE_PROFILE,
  user: { ...FAKE_PROFILE.user, avatarUrl: null },
};

const FAKE_PROFILE_WITH_CURSOR: UserProfileResponse = {
  ...FAKE_PROFILE,
  cursor: 'next-page-cursor',
};

const FAKE_PROFILE_EMPTY_POSTS: UserProfileResponse = {
  ...FAKE_PROFILE,
  posts: [],
};

// ── Helpers ──────────────────────────────────────────────────────────
function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      {
        path: '/user/:id',
        name: 'user-profile',
        component: UserProfilePage,
      },
      {
        path: '/posts/:id',
        name: 'post-view',
        component: { template: '<div />' },
      },
    ],
  });
}

describe('UserProfilePage.vue', () => {
  let router: Router;

  beforeEach(async () => {
    mockFetchProfile.mockReset();
    mockLoadMore.mockReset();
    mockProfile.value = null;
    mockLoading.value = false;
    mockError.value = null;

    router = createTestRouter();
    await router.push('/user/u1');
    await router.isReady();
  });

  // ── DoD #5: watches route.params.id and calls fetchProfile on change ──
  it('calls fetchProfile with route param id on mount', async () => {
    mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    expect(mockFetchProfile).toHaveBeenCalledWith('u1');
  });

  it('calls fetchProfile again when route param id changes', async () => {
    mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();
    mockFetchProfile.mockClear();

    await router.push('/user/u2');
    await flushPromises();

    expect(mockFetchProfile).toHaveBeenCalledWith('u2');
  });

  // ── DoD #10: loading state ──
  it('shows loading state when loading is true', async () => {
    mockLoading.value = true;

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="loading"]').exists()).toBe(true);
  });

  // ── DoD #10: error state ──
  it('shows error state when error is set', async () => {
    mockError.value = 'User not found';

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="error"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('User not found');
  });

  // ── DoD #6: displays avatar with image ──
  it('displays avatar image when avatarUrl is present', async () => {
    mockProfile.value = FAKE_PROFILE;

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    const img = wrapper.find('[data-testid="avatar-img"]');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/alice.png');
  });

  // ── DoD #6: avatar initial fallback ──
  it('displays initial fallback when avatarUrl is null', async () => {
    mockProfile.value = FAKE_PROFILE_NO_AVATAR;

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    const fallback = wrapper.find('[data-testid="avatar-fallback"]');
    expect(fallback.exists()).toBe(true);
    expect(fallback.text()).toBe('A');
  });

  // ── DoD #6: displayName ──
  it('displays the user displayName', async () => {
    mockProfile.value = FAKE_PROFILE;

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('Alice');
  });

  // ── DoD #6: formatted join date ──
  it('displays formatted join date', async () => {
    mockProfile.value = FAKE_PROFILE;

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    // January 2024
    expect(wrapper.text()).toContain('January 2024');
  });

  // ── DoD #7: renders UserBadge components ──
  it('renders UserBadge for each badge', async () => {
    mockProfile.value = FAKE_PROFILE;

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    const badges = wrapper.findAll('[data-testid="user-badge"]');
    expect(badges).toHaveLength(2);
    expect(badges[0].text()).toContain('#1 Contributor');
    expect(badges[1].text()).toContain('TypeScript Expert');
  });

  // ── DoD #8: renders UserStats component ──
  it('renders UserStats component with stats', async () => {
    mockProfile.value = FAKE_PROFILE;

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="user-stats"]').exists()).toBe(true);
  });

  // ── DoD #9: renders post list with RouterLinks ──
  it('renders post list with RouterLinks to post-view', async () => {
    mockProfile.value = FAKE_PROFILE;

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    const postLinks = wrapper.findAll('[data-testid="post-link"]');
    expect(postLinks).toHaveLength(1);
    expect(postLinks[0].text()).toContain('My Post');
    // RouterLink should point to /posts/p1
    const anchor = postLinks[0].find('a');
    expect(anchor.exists() ? anchor.attributes('href') : postLinks[0].attributes('href')).toBe(
      '/posts/p1',
    );
  });

  // ── DoD #10: empty posts state ──
  it('shows empty posts state when posts array is empty', async () => {
    mockProfile.value = FAKE_PROFILE_EMPTY_POSTS;

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="empty-posts"]').exists()).toBe(true);
  });

  // ── DoD #11: Load more button when cursor exists ──
  it('shows "Load more" button when cursor exists', async () => {
    mockProfile.value = FAKE_PROFILE_WITH_CURSOR;

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    const btn = wrapper.find('[data-testid="load-more"]');
    expect(btn.exists()).toBe(true);
  });

  it('calls loadMore when "Load more" button is clicked', async () => {
    mockProfile.value = FAKE_PROFILE_WITH_CURSOR;

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    const btn = wrapper.find('[data-testid="load-more"]');
    await btn.trigger('click');

    expect(mockLoadMore).toHaveBeenCalled();
  });

  it('does not show "Load more" button when cursor is null', async () => {
    mockProfile.value = FAKE_PROFILE;

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="load-more"]').exists()).toBe(false);
  });

  // ── Branch coverage: post with null language ──
  it('renders post without language span when language is null', async () => {
    mockProfile.value = {
      ...FAKE_PROFILE,
      posts: [{ ...FAKE_PROFILE.posts[0], language: null, tags: [] }],
    };

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    const postLink = wrapper.find('[data-testid="post-link"]');
    // With null language and empty tags, "typescript" should not appear
    expect(postLink.text()).not.toContain('typescript');
  });

  // ── Branch coverage: timeAgo branches (minutes, hours, days) ──
  it('displays "just now" for very recent posts', async () => {
    const justNow = new Date().toISOString();
    mockProfile.value = {
      ...FAKE_PROFILE,
      posts: [{ ...FAKE_PROFILE.posts[0], createdAt: justNow }],
    };

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('just now');
  });

  it('displays relative time in minutes for recent posts', async () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    mockProfile.value = {
      ...FAKE_PROFILE,
      posts: [{ ...FAKE_PROFILE.posts[0], createdAt: fiveMinAgo }],
    };

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('5m ago');
  });

  it('displays relative time in hours for older posts', async () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    mockProfile.value = {
      ...FAKE_PROFILE,
      posts: [{ ...FAKE_PROFILE.posts[0], createdAt: threeHoursAgo }],
    };

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('3h ago');
  });

  it('displays relative time in days for old posts', async () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString();
    mockProfile.value = {
      ...FAKE_PROFILE,
      posts: [{ ...FAKE_PROFILE.posts[0], createdAt: twoDaysAgo }],
    };

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.text()).toContain('2d ago');
  });

  // ── Content not shown during loading ──
  it('does not show profile content when loading', async () => {
    mockLoading.value = true;

    const wrapper = mount(UserProfilePage, { global: { plugins: [router] } });
    await flushPromises();

    expect(wrapper.find('[data-testid="user-stats"]').exists()).toBe(false);
  });
});
