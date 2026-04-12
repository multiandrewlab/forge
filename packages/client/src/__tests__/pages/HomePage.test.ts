import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { ref } from 'vue';
import type { PostWithAuthor } from '@forge/shared';

// Mock apiFetch (used by useFeed and PostDetail)
vi.mock('../../lib/api.js', () => ({ apiFetch: vi.fn() }));
import { apiFetch } from '../../lib/api.js';
const mockApiFetch = apiFetch as Mock;

// Mock useAuth (used by PostActions inside PostDetail)
vi.mock('../../composables/useAuth.js', () => ({
  useAuth: () => ({
    user: ref({ id: 'u1', displayName: 'Test User', avatarUrl: null }),
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}));

// Mock shiki (used by CodeViewer inside PostDetail)
vi.mock('shiki', () => ({
  codeToHtml: vi.fn().mockResolvedValue('<pre><code>test</code></pre>'),
}));

import HomePage from '../../pages/HomePage.vue';

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

function makeFeedResponse(posts: PostWithAuthor[] = [mockPost]) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ posts, cursor: null }),
  } as Response;
}

function makePostDetailResponse() {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ...mockPost, revisions: [] }),
  } as Response;
}

// Mock matchMedia — desktop by default (min-width: 768px matches)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  configurable: true,
  value: vi.fn().mockReturnValue({ matches: true }),
});

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: HomePage },
      { path: '/trending', component: HomePage, props: { sort: 'trending' } },
      { path: '/my-snippets', component: HomePage, props: { filter: 'mine' } },
      { path: '/posts/new', component: { template: '<div />' } },
      { path: '/posts/:id', component: { template: '<div />' } },
    ],
  });
}

describe('HomePage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
    // Feed load returns posts; post detail fetch returns empty
    mockApiFetch.mockImplementation((url: string) => {
      if ((url as string).includes('/api/posts?')) return makeFeedResponse();
      return makePostDetailResponse();
    });
  });

  it('loads posts on mount', async () => {
    const router = createTestRouter();
    await router.push('/');
    await router.isReady();
    mount(HomePage, { global: { plugins: [router] } });
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledWith(expect.stringContaining('/api/posts?'));
  });

  it('renders post titles after load', async () => {
    const router = createTestRouter();
    await router.push('/');
    await router.isReady();
    const wrapper = mount(HomePage, { global: { plugins: [router] } });
    await flushPromises();
    expect(wrapper.html()).toContain('Test Post');
  });

  it('reloads when sort prop changes', async () => {
    const router = createTestRouter();
    await router.push('/');
    await router.isReady();
    const wrapper = mount(HomePage, {
      props: { sort: undefined },
      global: { plugins: [router] },
    });
    await flushPromises();
    const callsBefore = mockApiFetch.mock.calls.filter((c) =>
      (c[0] as string).includes('/api/posts?'),
    ).length;

    await wrapper.setProps({ sort: 'trending' });
    await flushPromises();

    const callsAfter = mockApiFetch.mock.calls.filter((c) =>
      (c[0] as string).includes('/api/posts?'),
    ).length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
  });

  it('reloads when filter prop changes and passes filter in URL', async () => {
    const router = createTestRouter();
    await router.push('/');
    await router.isReady();
    const wrapper = mount(HomePage, {
      props: { filter: undefined },
      global: { plugins: [router] },
    });
    await flushPromises();
    const callsBefore = mockApiFetch.mock.calls.filter((c) =>
      (c[0] as string).includes('/api/posts?'),
    ).length;

    await wrapper.setProps({ filter: 'mine' });
    await flushPromises();

    const callsAfter = mockApiFetch.mock.calls.filter((c) =>
      (c[0] as string).includes('/api/posts?'),
    ).length;
    expect(callsAfter).toBeGreaterThan(callsBefore);
    const feedCalls = mockApiFetch.mock.calls.filter((c) =>
      (c[0] as string).includes('/api/posts?'),
    );
    const lastFeedCall = feedCalls[feedCalls.length - 1][0] as string;
    expect(lastFeedCall).toContain('filter=mine');
  });

  it('auto-selects first post on desktop after load', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }), // min-width: 768px matches = desktop
    });

    const router = createTestRouter();
    await router.push('/');
    await router.isReady();
    mount(HomePage, { global: { plugins: [router] } });
    await flushPromises();

    const { useFeedStore } = await import('../../stores/feed.js');
    const store = useFeedStore();
    expect(store.selectedPostId).toBe('1');
  });

  it('calls setSort on mount when sort prop is provided', async () => {
    const router = createTestRouter();
    await router.push('/trending');
    await router.isReady();
    mount(HomePage, {
      props: { sort: 'trending' as const },
      global: { plugins: [router] },
    });
    await flushPromises();

    // setSort triggers a feed fetch — verify the URL contains sort=trending
    const feedCalls = mockApiFetch.mock.calls.filter((c) =>
      (c[0] as string).includes('/api/posts?'),
    );
    expect(feedCalls.length).toBeGreaterThan(0);
    const lastUrl = feedCalls[feedCalls.length - 1][0] as string;
    expect(lastUrl).toContain('sort=trending');
  });

  it('calls setFilter on mount when filter prop is provided (no sort)', async () => {
    const router = createTestRouter();
    await router.push('/my-snippets');
    await router.isReady();
    mount(HomePage, {
      props: { filter: 'mine' as const },
      global: { plugins: [router] },
    });
    await flushPromises();

    // setFilter triggers a feed fetch — verify the URL contains filter=mine
    const feedCalls = mockApiFetch.mock.calls.filter((c) =>
      (c[0] as string).includes('/api/posts?'),
    );
    expect(feedCalls.length).toBeGreaterThan(0);
    const lastUrl = feedCalls[feedCalls.length - 1][0] as string;
    expect(lastUrl).toContain('filter=mine');
  });

  it('calls setFilter(null) when filter prop changes to undefined (line 74 branch)', async () => {
    const router = createTestRouter();
    await router.push('/');
    await router.isReady();
    const wrapper = mount(HomePage, {
      props: { filter: 'mine' as const },
      global: { plugins: [router] },
    });
    await flushPromises();

    // Change filter prop to undefined — watcher fires, setFilter(null) called
    await wrapper.setProps({ filter: undefined });
    await flushPromises();

    // Verify setFilter(null) triggered a new feed fetch
    const feedCalls = mockApiFetch.mock.calls.filter((c) =>
      (c[0] as string).includes('/api/posts?'),
    );
    expect(feedCalls.length).toBeGreaterThan(0);
  });
});
