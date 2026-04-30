import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory, type Router } from 'vue-router';
import type { PostWithAuthor } from '@forge/shared';

// Mock apiFetch
vi.mock('../../lib/api.js', () => ({ apiFetch: vi.fn() }));
import { apiFetch } from '../../lib/api.js';
const mockApiFetch = apiFetch as Mock;

// Mock useTags composable
const mockSubscribe = vi.fn().mockResolvedValue(undefined);
const mockUnsubscribe = vi.fn().mockResolvedValue(undefined);
vi.mock('../../composables/useTags.js', () => ({
  useTags: () => ({
    subscribe: mockSubscribe,
    unsubscribe: mockUnsubscribe,
  }),
}));

// Mock PostList — keep it minimal so we don't transitively load CodeViewer/shiki
vi.mock('../../components/post/PostList.vue', () => ({
  default: {
    name: 'PostList',
    props: [
      'posts',
      'selectedPostId',
      'loading',
      'error',
      'hasMore',
      'currentSort',
      'currentFilter',
      'currentTag',
    ],
    template:
      '<div data-testid="post-list-stub">posts={{ posts.length }} tag={{ currentTag }}</div>',
  },
}));

// Mock TagSubscribeButton — we test it elsewhere; here we only verify wiring
vi.mock('../../components/tags/TagSubscribeButton.vue', () => ({
  default: {
    name: 'TagSubscribeButton',
    props: ['tag', 'loading', 'error'],
    emits: ['subscribe', 'unsubscribe'],
    template:
      '<button data-testid="subscribe-btn-stub" @click="$emit(\'subscribe\')">Subscribe</button>',
  },
}));

import TagPage from '../../pages/TagPage.vue';

const TAG = {
  id: 'b0000000-0000-0000-0000-000000000001',
  name: 'typescript',
  postCount: 4,
  subscriberCount: 2,
};

const POST: PostWithAuthor = {
  id: 'p1',
  authorId: 'u1',
  title: 'A TS Post',
  contentType: 'snippet',
  language: 'ts',
  visibility: 'public',
  isDraft: false,
  forkedFromId: null,
  linkUrl: null,
  linkPreview: null,
  voteCount: 0,
  viewCount: 0,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: 'u1', displayName: 'Alice', avatarUrl: null },
  tags: [],
  forkCount: 0,
  forkedFromTitle: null,
};

function makeRes(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
      { path: '/tags/:name', name: 'tag', component: TagPage },
    ],
  });
}

async function mountPage(router: Router, name = 'typescript') {
  router.push(`/tags/${name}`);
  await router.isReady();
  return mount(TagPage, {
    global: {
      plugins: [router],
    },
  });
}

describe('<TagPage>', () => {
  let router: Router;

  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
    mockSubscribe.mockClear();
    mockUnsubscribe.mockClear();
    router = createTestRouter();
  });

  it('shows loading state before fetch resolves', async () => {
    // tag fetch never resolves
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    const wrapper = await mountPage(router);
    expect(wrapper.find('[data-testid="tag-page-loading"]').exists()).toBe(true);
  });

  it('renders tag-page with title and PostList on success', async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeRes(TAG))
      .mockResolvedValueOnce(makeRes({ posts: [POST], cursor: null }));
    const wrapper = await mountPage(router);
    await flushPromises();
    expect(wrapper.find('[data-testid="tag-page"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="tag-page-title"]').text()).toContain('typescript');
    expect(wrapper.find('[data-testid="post-list-stub"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tag-page-empty"]').exists()).toBe(false);
  });

  it('renders empty state when there are 0 posts', async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeRes(TAG))
      .mockResolvedValueOnce(makeRes({ posts: [], cursor: null }));
    const wrapper = await mountPage(router);
    await flushPromises();
    expect(wrapper.find('[data-testid="tag-page-empty"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="post-list-stub"]').exists()).toBe(false);
  });

  it('renders tag-not-found on 404', async () => {
    mockApiFetch.mockResolvedValueOnce(makeRes({ error: 'not found' }, false, 404));
    const wrapper = await mountPage(router, 'nope');
    await flushPromises();
    expect(wrapper.find('[data-testid="tag-not-found"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tag-page"]').exists()).toBe(false);
  });

  it('keeps loading state on non-404 tag fetch error', async () => {
    mockApiFetch.mockResolvedValueOnce(makeRes({ error: 'oops' }, false, 500));
    const wrapper = await mountPage(router);
    await flushPromises();
    expect(wrapper.find('[data-testid="tag-page-loading"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tag-not-found"]').exists()).toBe(false);
  });

  it('fetches feed even when feed responds with error (no posts shown)', async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeRes(TAG))
      .mockResolvedValueOnce(makeRes({ error: 'feed broke' }, false, 500));
    const wrapper = await mountPage(router);
    await flushPromises();
    // Tag still loaded — empty state shown because posts stayed []
    expect(wrapper.find('[data-testid="tag-page"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="tag-page-empty"]').exists()).toBe(true);
  });

  it('reloads when route param name changes', async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeRes(TAG))
      .mockResolvedValueOnce(makeRes({ posts: [POST], cursor: null }))
      .mockResolvedValueOnce(makeRes({ ...TAG, name: 'vue', postCount: 2 }))
      .mockResolvedValueOnce(makeRes({ posts: [], cursor: null }));
    const wrapper = await mountPage(router, 'typescript');
    await flushPromises();
    expect(wrapper.get('[data-testid="tag-page-title"]').text()).toContain('typescript');

    await router.push('/tags/vue');
    await flushPromises();
    expect(wrapper.get('[data-testid="tag-page-title"]').text()).toContain('vue');
    expect(wrapper.find('[data-testid="tag-page-empty"]').exists()).toBe(true);
  });

  it('calls useTags.subscribe when child emits subscribe', async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeRes(TAG))
      .mockResolvedValueOnce(makeRes({ posts: [POST], cursor: null }));
    const wrapper = await mountPage(router);
    await flushPromises();
    await wrapper.get('[data-testid="subscribe-btn-stub"]').trigger('click');
    await flushPromises();
    expect(mockSubscribe).toHaveBeenCalledTimes(1);
    expect(mockSubscribe).toHaveBeenCalledWith(
      expect.objectContaining({ id: TAG.id, name: 'typescript' }),
    );
  });

  it('calls useTags.unsubscribe when child emits unsubscribe', async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeRes(TAG))
      .mockResolvedValueOnce(makeRes({ posts: [POST], cursor: null }));
    const wrapper = await mountPage(router);
    await flushPromises();
    // Child stub only emits subscribe; emit unsubscribe directly
    const child = wrapper.findComponent({ name: 'TagSubscribeButton' });
    await child.vm.$emit('unsubscribe');
    await flushPromises();
    expect(mockUnsubscribe).toHaveBeenCalledWith(TAG.id);
  });

  it('captures subscribe error when useTags.subscribe rejects', async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeRes(TAG))
      .mockResolvedValueOnce(makeRes({ posts: [POST], cursor: null }));
    mockSubscribe.mockRejectedValueOnce(new Error('boom'));
    const wrapper = await mountPage(router);
    await flushPromises();
    await wrapper.get('[data-testid="subscribe-btn-stub"]').trigger('click');
    await flushPromises();
    const child = wrapper.findComponent({ name: 'TagSubscribeButton' });
    expect(child.props('error')).toBeTruthy();
  });

  it('captures unsubscribe error when useTags.unsubscribe rejects', async () => {
    mockApiFetch
      .mockResolvedValueOnce(makeRes(TAG))
      .mockResolvedValueOnce(makeRes({ posts: [POST], cursor: null }));
    mockUnsubscribe.mockRejectedValueOnce(new Error('nope'));
    const wrapper = await mountPage(router);
    await flushPromises();
    const child = wrapper.findComponent({ name: 'TagSubscribeButton' });
    await child.vm.$emit('unsubscribe');
    await flushPromises();
    expect(child.props('error')).toBeTruthy();
  });
});
