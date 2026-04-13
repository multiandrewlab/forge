import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import { ref } from 'vue';
import type { Router } from 'vue-router';
import type { Pinia } from 'pinia';
import type { Ref } from 'vue';
import type { PostWithRevision } from '@forge/shared';
import type { User } from '@forge/shared';

// --- Mock usePosts composable ---
const mockFetchPost = vi.fn();
const mockDeletePost = vi.fn();
const mockPostError: Ref<string | null> = ref(null);

vi.mock('@/composables/usePosts', () => ({
  usePosts: () => ({
    fetchPost: mockFetchPost,
    deletePost: mockDeletePost,
    error: mockPostError,
  }),
}));

// --- Mock useAuth composable ---
const mockUser: Ref<User | null> = ref(null);

vi.mock('@/composables/useAuth', () => ({
  useAuth: () => ({
    user: mockUser,
  }),
}));

// --- Mock usePostsStore ---
const mockCurrentPost: Ref<PostWithRevision | null> = ref(null);

vi.mock('@/stores/posts', () => ({
  usePostsStore: () => ({
    currentPost: mockCurrentPost,
  }),
}));

// --- Mock pinia storeToRefs to return our mock refs ---
vi.mock('pinia', async () => {
  const actual = await vi.importActual<typeof import('pinia')>('pinia');
  return {
    ...actual,
    storeToRefs: () => ({
      currentPost: mockCurrentPost,
    }),
  };
});

// --- Mock CodeViewer component ---
vi.mock('@/components/post/CodeViewer.vue', () => ({
  default: {
    name: 'CodeViewer',
    props: ['code', 'language'],
    template: '<div data-testid="code-viewer">{{ code }}</div>',
  },
}));

// --- Mock PresenceIndicator component ---
vi.mock('@/components/post/PresenceIndicator.vue', () => ({
  default: {
    name: 'PresenceIndicator',
    props: ['postId'],
    template: '<div data-testid="presence-indicator"></div>',
  },
}));

// --- Mock useComments composable (subscribeRealtime) ---
const mockCommentsSubscribeCleanup = vi.fn();
const mockCommentsSubscribeRealtime = vi.fn().mockReturnValue(mockCommentsSubscribeCleanup);

vi.mock('@/composables/useComments', () => ({
  useComments: () => ({
    subscribeRealtime: mockCommentsSubscribeRealtime,
    fetchComments: vi.fn(),
    addComment: vi.fn(),
    editComment: vi.fn(),
    deleteComment: vi.fn(),
    error: ref(null),
    loading: ref(false),
  }),
}));

// --- Mock useVotes composable (subscribeRealtime) ---
const mockVotesSubscribeCleanup = vi.fn();
const mockVotesSubscribeRealtime = vi.fn().mockReturnValue(mockVotesSubscribeCleanup);

vi.mock('@/composables/useVotes', () => ({
  useVotes: () => ({
    subscribeRealtime: mockVotesSubscribeRealtime,
    vote: vi.fn(),
    removeVote: vi.fn(),
    error: ref(null),
    loading: ref(false),
  }),
}));

import PostViewPage from '@/pages/PostViewPage.vue';

function createMockPost(overrides: Partial<PostWithRevision> = {}): PostWithRevision {
  return {
    id: 'post-1',
    authorId: 'user-1',
    title: 'Test Post',
    contentType: 'code' as const,
    language: 'typescript',
    visibility: 'public' as const,
    isDraft: false,
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
        content: 'const x = 1;',
        message: null,
        revisionNumber: 1,
        createdAt: new Date('2025-01-01'),
      },
    ],
    ...overrides,
  };
}

function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: 'user-1',
    email: 'test@example.com',
    displayName: 'Test User',
    avatarUrl: null,
    authProvider: 'local' as const,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
      {
        path: '/posts/:id',
        name: 'post-view',
        component: PostViewPage,
      },
      {
        path: '/posts/:id/edit',
        name: 'post-edit',
        component: { template: '<div>Edit</div>' },
      },
    ],
  });
}

describe('PostViewPage', () => {
  let pinia: Pinia;
  let router: Router;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = createTestRouter();

    mockFetchPost.mockReset();
    mockDeletePost.mockReset();
    mockPostError.value = null;
    mockCurrentPost.value = null;
    mockUser.value = null;
    mockCommentsSubscribeRealtime.mockClear();
    mockCommentsSubscribeCleanup.mockClear();
    mockVotesSubscribeRealtime.mockClear();
    mockVotesSubscribeCleanup.mockClear();
  });

  async function mountPage(postId = 'post-1') {
    router.push(`/posts/${postId}`);
    await router.isReady();

    return mount(PostViewPage, {
      global: {
        plugins: [pinia, router],
      },
    });
  }

  describe('loading state', () => {
    it('should show loading indicator while fetching', async () => {
      // fetchPost never resolves during this test
      mockFetchPost.mockReturnValue(new Promise(() => {}));

      const wrapper = await mountPage();
      expect(wrapper.text()).toContain('Loading...');
    });
  });

  describe('successful fetch - author view', () => {
    it('should render post title and CodeViewer after fetch', async () => {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: 'user-1' });

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.text()).toContain('Test Post');
      const codeViewer = wrapper.find('[data-testid="code-viewer"]');
      expect(codeViewer.exists()).toBe(true);
      expect(codeViewer.text()).toContain('const x = 1;');
    });

    it('should show Edit and Delete buttons for the author', async () => {
      const post = createMockPost({ authorId: 'user-1' });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: 'user-1' });

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.text()).toContain('Edit');
      expect(wrapper.text()).toContain('Delete');
    });

    it('should display post metadata (contentType, language, revision number)', async () => {
      const post = createMockPost({
        contentType: 'code',
        language: 'typescript',
      });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: 'user-1' });

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.text()).toContain('code');
      expect(wrapper.text()).toContain('typescript');
      expect(wrapper.text()).toContain('Rev 1');
    });

    it('should hide language when language is null', async () => {
      const post = createMockPost({ language: null });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: post.authorId });

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.text()).not.toContain('typescript');
    });
  });

  describe('successful fetch - non-author view', () => {
    it('should not show Edit and Delete buttons for a non-author', async () => {
      const post = createMockPost({ authorId: 'user-1' });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: 'other-user' });

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.text()).toContain('Test Post');
      expect(wrapper.text()).not.toContain('Edit');
      expect(wrapper.text()).not.toContain('Delete');
    });

    it('should not show Edit/Delete when user is null (unauthenticated view)', async () => {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = null;

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.text()).toContain('Test Post');
      expect(wrapper.text()).not.toContain('Edit');
      expect(wrapper.text()).not.toContain('Delete');
    });
  });

  describe('fetch failure', () => {
    it('should show "Post not found" when currentPost is null after fetch', async () => {
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = null;
      });

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.text()).toContain('Post not found');
    });

    it('should show error message when fetch sets an error', async () => {
      mockFetchPost.mockImplementation(async () => {
        mockPostError.value = 'Failed to fetch post';
        mockCurrentPost.value = null;
      });

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.text()).toContain('Failed to fetch post');
    });
  });

  describe('delete action', () => {
    it('should call deletePost and navigate to home on successful delete', async () => {
      const post = createMockPost({ authorId: 'user-1' });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockDeletePost.mockImplementation(async () => {
        mockPostError.value = null;
      });
      mockUser.value = createMockUser({ id: 'user-1' });

      const wrapper = await mountPage();
      await flushPromises();

      const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'Delete') as
        | ReturnType<typeof wrapper.find>
        | undefined;
      expect(deleteButton).toBeDefined();
      await (deleteButton as ReturnType<typeof wrapper.find>).trigger('click');
      await flushPromises();

      expect(mockDeletePost).toHaveBeenCalledWith('post-1');
      expect(router.currentRoute.value.path).toBe('/');
    });
  });

  describe('back link', () => {
    it('should render a "Back to Workspace" link pointing to home', async () => {
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = createMockPost();
      });
      mockUser.value = createMockUser();

      const wrapper = await mountPage();
      await flushPromises();

      const backLink = wrapper.find('a[href="/"]');
      expect(backLink.exists()).toBe(true);
      expect(backLink.text()).toContain('Back to Workspace');
    });
  });

  describe('latestRevision edge cases', () => {
    it('should not render CodeViewer when post has no revisions (line 88 branch)', async () => {
      const post = createMockPost({ revisions: [] });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: post.authorId });

      const wrapper = await mountPage();
      await flushPromises();

      // Post title still shown
      expect(wrapper.text()).toContain('Test Post');
      // CodeViewer not rendered because latestRevision is undefined
      expect(wrapper.find('[data-testid="code-viewer"]').exists()).toBe(false);
    });

    it('latestRevision returns undefined when currentPost becomes null (line 20 branch)', async () => {
      // Start with a post loaded, then clear it — forces computed to re-evaluate with null
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: post.authorId });

      const wrapper = await mountPage();
      await flushPromises();

      // Post is shown — latestRevision computed is accessed and returns revision
      expect(wrapper.text()).toContain('Test Post');

      // Clear the post — latestRevision computed re-runs, hits `if (!currentPost.value) return undefined`
      mockCurrentPost.value = null;
      await wrapper.vm.$nextTick();
      await flushPromises();

      // Template shows "Post not found" (the v-else branch)
      expect(wrapper.text()).toContain('Post not found');

      // Force the computed to be evaluated while null by reading it from the component internals
      const vm = wrapper.vm as unknown as { latestRevision: unknown };
      if ('latestRevision' in vm) {
        expect(vm.latestRevision).toBeUndefined();
      }
    });

    it('should not show revision number when revisions array is empty (line 65 branch)', async () => {
      const post = createMockPost({ revisions: [] });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: post.authorId });

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.text()).not.toContain('Rev ');
    });

    it('should not navigate home when deletePost sets an error (line 37 branch)', async () => {
      const post = createMockPost({ authorId: 'user-1' });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockDeletePost.mockImplementation(async () => {
        mockPostError.value = 'Delete failed';
      });
      mockUser.value = createMockUser({ id: 'user-1' });

      const wrapper = await mountPage();
      await flushPromises();

      const deleteButton = wrapper.findAll('button').find((b) => b.text() === 'Delete') as
        | ReturnType<typeof wrapper.find>
        | undefined;
      expect(deleteButton).toBeDefined();
      await (deleteButton as ReturnType<typeof wrapper.find>).trigger('click');
      await flushPromises();

      // Should stay on the post-view route, not navigate to '/'
      expect(router.currentRoute.value.name).toBe('post-view');
    });
  });

  describe('realtime subscriptions', () => {
    it('should subscribe to comments and votes realtime on mount', async () => {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser();

      await mountPage();
      await flushPromises();

      expect(mockCommentsSubscribeRealtime).toHaveBeenCalledWith('post-1');
      expect(mockVotesSubscribeRealtime).toHaveBeenCalledWith('post-1');
    });

    it('should clean up subscriptions on unmount', async () => {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser();

      const wrapper = await mountPage();
      await flushPromises();

      wrapper.unmount();

      expect(mockCommentsSubscribeCleanup).toHaveBeenCalled();
      expect(mockVotesSubscribeCleanup).toHaveBeenCalled();
    });

    it('should render PresenceIndicator when post is loaded', async () => {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser();

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="presence-indicator"]').exists()).toBe(true);
    });
  });
});
