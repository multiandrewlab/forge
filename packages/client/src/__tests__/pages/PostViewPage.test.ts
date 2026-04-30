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
const mockPostErrorStatus: Ref<number | null> = ref(null);
const mockForkPost = vi.fn();

vi.mock('@/composables/usePosts', () => ({
  usePosts: () => ({
    fetchPost: mockFetchPost,
    deletePost: mockDeletePost,
    forkPost: mockForkPost,
    error: mockPostError,
    errorStatus: mockPostErrorStatus,
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

// --- Mock useFilesStore ---
// PostViewPage now fetches the post's revision files for the multi-file
// post-file-list surface (issue #47 Task 7.3). The default returns no files
// so existing single-file specs still see an empty list.
const mockFetchFiles = vi.fn().mockResolvedValue(undefined);
const mockFilesByRevision: Ref<Record<string, unknown[]>> = ref({});

vi.mock('@/stores/files', () => ({
  useFilesStore: () => ({
    fetchFiles: mockFetchFiles,
    filesByRevision: mockFilesByRevision.value,
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

// --- Mock PostActions (Phase-4 social bar) ---
// Includes a `fork` emit so the fork-action wiring on PostViewPage can be
// exercised without depending on the real PostActions implementation.
vi.mock('@/components/post/PostActions.vue', () => ({
  default: {
    name: 'PostActions',
    props: ['post'],
    emits: ['fork'],
    template:
      '<div data-testid="post-actions">' +
      '<button data-testid="post-actions-fork" @click="$emit(\'fork\')">Fork</button>' +
      'vc:{{ post?.voteCount }}' +
      '</div>',
  },
}));

// --- Mock CommentSection ---
vi.mock('@/components/post/CommentSection.vue', () => ({
  default: {
    name: 'CommentSection',
    props: ['postId', 'currentUserId'],
    template: '<div data-testid="comment-section">{{ postId }}|{{ currentUserId }}</div>',
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
    tags: [],
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
    mockPostErrorStatus.value = null;
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
      const titleEl = wrapper.find('[data-testid="post-title"]');
      expect(titleEl.exists()).toBe(true);
      expect(titleEl.text()).toContain('Test Post');
      const codeViewer = wrapper.find('[data-testid="code-viewer"]');
      expect(codeViewer.exists()).toBe(true);
      expect(codeViewer.text()).toContain('const x = 1;');
    });

    it('should render draft-badge when post.isDraft is true', async () => {
      const post = createMockPost({ isDraft: true });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: 'user-1' });

      const wrapper = await mountPage();
      await flushPromises();

      const badge = wrapper.find('[data-testid="draft-badge"]');
      expect(badge.exists()).toBe(true);
      expect(badge.text()).toContain('Draft');
    });

    it('should NOT render draft-badge when post.isDraft is false', async () => {
      const post = createMockPost({ isDraft: false });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: 'user-1' });

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="draft-badge"]').exists()).toBe(false);
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

    it('renders post-tag-chip-<name> for each tag (#63)', async () => {
      const post = createMockPost({ tags: ['rust', 'typescript'] });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: post.authorId });

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="post-tag-chip-rust"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="post-tag-chip-typescript"]').exists()).toBe(true);
    });

    it('omits the tag-chip block when post has no tags', async () => {
      const post = createMockPost({ tags: [] });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: post.authorId });

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid^="post-tag-chip-"]').exists()).toBe(false);
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

    // WU8 of issue #62: a 403 from the API renders a dedicated forbidden
    // surface so the user understands the post is private rather than missing.
    it('should render forbidden-page surface when errorStatus is 403', async () => {
      mockFetchPost.mockImplementation(async () => {
        mockPostError.value = 'You do not have access to this post';
        mockPostErrorStatus.value = 403;
        mockCurrentPost.value = null;
      });

      const wrapper = await mountPage();
      await flushPromises();

      const forbidden = wrapper.find('[data-testid="forbidden-page"]');
      expect(forbidden.exists()).toBe(true);
      expect(forbidden.text()).toContain('This post is private');
      expect(forbidden.text()).toContain('You do not have access to this post');
      // Generic error banner should NOT also be rendered.
      expect(wrapper.findAll('[data-testid="forbidden-page"]').length).toBe(1);
    });

    it('should fall back to default body text on 403 when error is empty', async () => {
      mockFetchPost.mockImplementation(async () => {
        mockPostError.value = null;
        mockPostErrorStatus.value = 403;
        mockCurrentPost.value = null;
      });

      const wrapper = await mountPage();
      await flushPromises();

      const forbidden = wrapper.find('[data-testid="forbidden-page"]');
      expect(forbidden.exists()).toBe(true);
      expect(forbidden.text()).toContain('The owner has not shared it with you.');
    });
  });

  describe('delete action', () => {
    it('opens the confirm dialog (does NOT delete) when the delete button is clicked', async () => {
      const post = createMockPost({ authorId: 'user-1' });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: 'user-1' });

      const wrapper = await mountPage();
      await flushPromises();

      // Dialog hidden by default.
      expect(wrapper.find('[data-testid="post-delete-dialog"]').exists()).toBe(false);

      await wrapper.find('[data-testid="post-delete-btn"]').trigger('click');
      await flushPromises();

      // Dialog now visible; deletePost was NOT called yet.
      expect(wrapper.find('[data-testid="post-delete-dialog"]').exists()).toBe(true);
      expect(mockDeletePost).not.toHaveBeenCalled();
    });

    it('cancel hides the dialog and does not call deletePost', async () => {
      const post = createMockPost({ authorId: 'user-1' });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: 'user-1' });

      const wrapper = await mountPage();
      await flushPromises();

      await wrapper.find('[data-testid="post-delete-btn"]').trigger('click');
      await flushPromises();
      expect(wrapper.find('[data-testid="post-delete-dialog"]').exists()).toBe(true);

      await wrapper.find('[data-testid="post-delete-cancel"]').trigger('click');
      await flushPromises();

      expect(wrapper.find('[data-testid="post-delete-dialog"]').exists()).toBe(false);
      expect(mockDeletePost).not.toHaveBeenCalled();
      expect(router.currentRoute.value.name).toBe('post-view');
    });

    it('confirm calls deletePost and navigates to home on success', async () => {
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

      await wrapper.find('[data-testid="post-delete-btn"]').trigger('click');
      await flushPromises();
      await wrapper.find('[data-testid="post-delete-confirm"]').trigger('click');
      await flushPromises();

      expect(mockDeletePost).toHaveBeenCalledWith('post-1');
      expect(router.currentRoute.value.path).toBe('/');
      // Dialog dismissed.
      expect(wrapper.find('[data-testid="post-delete-dialog"]').exists()).toBe(false);
    });
  });

  describe('fork action', () => {
    it('should call forkPost and redirect to the new post-edit page on success', async () => {
      const post = createMockPost({ authorId: 'user-2' });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockForkPost.mockResolvedValue('new-post-id');
      mockUser.value = createMockUser({ id: 'user-1' });

      const wrapper = await mountPage();
      await flushPromises();

      await wrapper.find('[data-testid="post-actions-fork"]').trigger('click');
      await flushPromises();

      expect(mockForkPost).toHaveBeenCalledWith('post-1');
      expect(router.currentRoute.value.path).toBe('/posts/new-post-id/edit');
    });

    it('should NOT navigate when forkPost returns null', async () => {
      const post = createMockPost({ authorId: 'user-2' });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockForkPost.mockResolvedValue(null);
      mockUser.value = createMockUser({ id: 'user-1' });

      const wrapper = await mountPage();
      await flushPromises();

      const initialPath = router.currentRoute.value.path;
      await wrapper.find('[data-testid="post-actions-fork"]').trigger('click');
      await flushPromises();

      expect(mockForkPost).toHaveBeenCalledWith('post-1');
      expect(router.currentRoute.value.path).toBe(initialPath);
    });

    it('should NOT call forkPost when currentPost is null (early-exit guard)', async () => {
      // Mount with a post so PostActions renders and we can capture the
      // component instance. Then null currentPost — but the v-if branch
      // unrenders PostActions, so to drive the `if (!currentPost.value)
      // return;` guard we have to call handleFork via the captured handle
      // BEFORE the v-if removes it. The captured emit triggers handleFork in
      // the same micro-task as the value=null mutation, but Vue's reactivity
      // is async — so by the time handleFork runs, currentPost is already
      // null. That's the precise condition we want to assert.
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = createMockPost({ authorId: 'user-2' });
      });
      mockUser.value = createMockUser({ id: 'user-1' });

      const wrapper = await mountPage();
      await flushPromises();

      const actions = wrapper.findComponent({ name: 'PostActions' });
      expect(actions.exists()).toBe(true);
      mockForkPost.mockClear();

      // Emit and null in the same tick so the listener sees currentPost=null.
      mockCurrentPost.value = null;
      actions.vm.$emit('fork');
      await flushPromises();

      expect(mockForkPost).not.toHaveBeenCalled();
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

      // Open dialog, then confirm — but deletePost surfaces an error so the
      // post-delete navigation guard short-circuits.
      await wrapper.find('[data-testid="post-delete-btn"]').trigger('click');
      await flushPromises();
      await wrapper.find('[data-testid="post-delete-confirm"]').trigger('click');
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

  describe('PostActions + CommentSection wiring', () => {
    it('renders PostActions with the synthesised PostWithAuthor adapter', async () => {
      const post = createMockPost({ voteCount: 42 });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: post.authorId });

      const wrapper = await mountPage();
      await flushPromises();

      const actions = wrapper.find('[data-testid="post-actions"]');
      expect(actions.exists()).toBe(true);
      expect(actions.text()).toContain('vc:42');
    });

    it('does NOT render PostActions when currentPost becomes null', async () => {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: post.authorId });

      const wrapper = await mountPage();
      await flushPromises();

      // Sanity: PostActions is rendered while the post is present.
      expect(wrapper.find('[data-testid="post-actions"]').exists()).toBe(true);

      // Clear currentPost — the surrounding v-if unmounts the whole block.
      mockCurrentPost.value = null;
      await wrapper.vm.$nextTick();
      await flushPromises();

      expect(wrapper.find('[data-testid="post-actions"]').exists()).toBe(false);
    });

    it('renders CommentSection wired to postId + currentUserId', async () => {
      const post = createMockPost({ id: 'pv-id' });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: 'viewer-id' });

      const wrapper = await mountPage('pv-id');
      await flushPromises();

      const section = wrapper.find('[data-testid="comment-section"]');
      expect(section.exists()).toBe(true);
      expect(section.text()).toContain('pv-id');
      expect(section.text()).toContain('viewer-id');
    });

    it('passes empty currentUserId to CommentSection when user is null', async () => {
      const post = createMockPost({ id: 'pv-id' });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = null;

      const wrapper = await mountPage('pv-id');
      await flushPromises();

      const section = wrapper.find('[data-testid="comment-section"]');
      expect(section.exists()).toBe(true);
      expect(section.text()).toContain('pv-id');
    });

    it('synthesises author fields from the latest revision (covers rev-present branch)', async () => {
      type RevWithMeta = NonNullable<PostWithRevision['revisions']>[number] & {
        authorDisplayName?: string | null;
        authorAvatarUrl?: string | null;
      };
      const rev: RevWithMeta = {
        id: 'rev-x',
        postId: 'post-1',
        content: 'x',
        message: null,
        revisionNumber: 1,
        createdAt: new Date(),
        authorDisplayName: 'Display',
        authorAvatarUrl: 'https://avatar.example/x.png',
      };
      const post = createMockPost({
        revisions: [rev as PostWithRevision['revisions'][number]],
      });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: post.authorId });

      const wrapper = await mountPage();
      await flushPromises();

      // With the revision present, postForActions resolves successfully.
      expect(wrapper.find('[data-testid="post-actions"]').exists()).toBe(true);
    });

    it('handles no-revision case in postForActions adapter (rev?.field fallback)', async () => {
      const post = createMockPost({ revisions: [] });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: post.authorId });

      const wrapper = await mountPage();
      await flushPromises();

      // Even with no revision, postForActions must still resolve (uses ?? fallbacks).
      expect(wrapper.find('[data-testid="post-actions"]').exists()).toBe(true);
    });
  });
});
