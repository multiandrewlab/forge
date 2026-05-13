import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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

// --- Mock apiFetch ---
// The Download button (issue #83 WU1) calls apiFetch directly so the request
// is bearer-authenticated. The test stubs it per-case to simulate happy/error
// paths; download flow specs replace the default with their own resolved value.
const mockApiFetch = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
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
      {
        path: '/tags/:name',
        name: 'tag-view',
        component: { template: '<div>Tag</div>' },
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
    mockApiFetch.mockReset();
    mockFetchFiles.mockClear();
    mockFilesByRevision.value = {};
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

    it('tag chips are navigable links to /tags/:name (#49)', async () => {
      const post = createMockPost({ tags: ['rust'] });
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      mockUser.value = createMockUser({ id: post.authorId });

      const wrapper = await mountPage();
      await flushPromises();

      const chip = wrapper.find('[data-testid="post-tag-chip-rust"]');
      expect(chip.exists()).toBe(true);
      // RouterLink renders as <a>; the e2e click-tag-from-post spec relies on
      // this navigating to /tags/:name from the post-view page.
      expect(chip.element.tagName.toLowerCase()).toBe('a');
      expect(chip.attributes('href')).toBe('/tags/rust');
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

    it('does not crash when currentPost.tags is undefined (server PATCH/publish returns Post-shape without tags)', async () => {
      // Simulates the gap: usePosts.updatePost / publishPost set currentPost
      // from a server response shaped as Post (no `tags` field), then a brief
      // render window before PostViewPage's own fetch completes. The defensive
      // `?? []` keeps the template from throwing on `tags.length`.
      const post = createMockPost();
      // Force tags to be missing — mimic the runtime gap upstream
      const postWithoutTags = post as unknown as Omit<typeof post, 'tags'>;
      delete (postWithoutTags as { tags?: unknown }).tags;
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = postWithoutTags as typeof post;
      });
      mockUser.value = createMockUser({ id: post.authorId });

      const wrapper = await mountPage();
      await flushPromises();

      // No crash; no chips rendered.
      expect(wrapper.find('[data-testid^="post-tag-chip-"]').exists()).toBe(false);
      // Title still renders, proving the template did not bail.
      expect(wrapper.find('[data-testid="post-title"]').exists()).toBe(true);
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

  // Issue #83 WU1: per-file Download button in `post-file-list`. The handler
  // calls apiFetch (bearer-authenticated), receives a Blob, creates an
  // ObjectURL, programmatically clicks an `<a download>`, and revokes the URL
  // synchronously after .click() — mirroring FilePreview's blob/ObjectURL
  // approach so the download works under cookie-less auth.
  describe('file download affordance', () => {
    function makeFile(
      overrides: Partial<{
        id: string;
        postId: string;
        revisionId: string | null;
        filename: string;
        mimeType: string | null;
        fileSize: number | null;
        sortOrder: number;
        createdAt: Date;
      }> = {},
    ) {
      return {
        id: 'file-1',
        postId: 'post-1',
        revisionId: 'rev-1',
        filename: 'attachment.txt',
        mimeType: 'text/plain',
        fileSize: 12,
        sortOrder: 0,
        createdAt: new Date('2025-01-01'),
        ...overrides,
      };
    }

    function setupSinglePostWithFile(files = [makeFile()]) {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        mockCurrentPost.value = post;
      });
      // The vi.mock for `@/stores/files` returns `mockFilesByRevision.value`
      // at the moment `useFilesStore()` is called (component setup), so the
      // files must be pre-populated before mount — fetchFiles is a no-op in
      // this test scope.
      mockFilesByRevision.value = { 'rev-1': files };
      mockUser.value = createMockUser({ id: post.authorId });
      return post;
    }

    it('renders a Download button per file with aria-label', async () => {
      setupSinglePostWithFile([
        makeFile({ id: 'f-a', filename: 'first.ts' }),
        makeFile({ id: 'f-b', filename: 'second.md' }),
      ]);

      const wrapper = await mountPage();
      await flushPromises();

      const buttons = wrapper.findAll('[data-testid="post-file-download-link"]');
      expect(buttons).toHaveLength(2);
      expect(buttons[0]?.attributes('aria-label')).toBe('Download first.ts');
      expect(buttons[1]?.attributes('aria-label')).toBe('Download second.md');
    });

    it('happy path: clicking Download fetches blob, creates ObjectURL, clicks <a>, revokes URL', async () => {
      setupSinglePostWithFile([makeFile({ id: 'f-x', filename: 'report.csv' })]);

      const blobData = new Blob(['col1,col2\n1,2'], { type: 'text/csv' });
      mockApiFetch.mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(blobData),
        headers: new Headers({ 'content-type': 'text/csv' }),
      } as Response);

      const mockUrl = 'blob:http://localhost/dl-1';
      const createObjectURLSpy = vi.fn().mockReturnValue(mockUrl);
      const revokeObjectURLSpy = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLSpy;
      globalThis.URL.revokeObjectURL = revokeObjectURLSpy;

      // Spy on createElement so we can inspect the transient <a> element
      // without relying on it staying in the DOM after .click() + .remove().
      const realCreateElement = document.createElement.bind(document);
      const anchorEl = realCreateElement('a') as HTMLAnchorElement;
      const clickSpy = vi.spyOn(anchorEl, 'click').mockImplementation(() => {});
      const createElementSpy = vi
        .spyOn(document, 'createElement')
        .mockImplementation((tag: string) => {
          if (tag === 'a') return anchorEl;
          return realCreateElement(tag);
        });

      const wrapper = await mountPage();
      await flushPromises();

      const button = wrapper.find('[data-testid="post-file-download-link"]');
      expect(button.exists()).toBe(true);

      await button.trigger('click');
      await flushPromises();

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1/files/f-x');
      expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
      expect(createObjectURLSpy).toHaveBeenCalledWith(blobData);
      expect(anchorEl.href).toContain(mockUrl);
      expect(anchorEl.download).toBe('report.csv');
      expect(clickSpy).toHaveBeenCalledTimes(1);
      expect(revokeObjectURLSpy).toHaveBeenCalledWith(mockUrl);

      createElementSpy.mockRestore();
    });

    it('error path: non-ok response surfaces a "Failed to download <filename>" error and skips ObjectURL', async () => {
      setupSinglePostWithFile([makeFile({ id: 'f-y', filename: 'broken.bin' })]);

      mockApiFetch.mockResolvedValue({
        ok: false,
        status: 500,
        blob: () => Promise.resolve(new Blob([])),
        headers: new Headers(),
      } as Response);

      const createObjectURLSpy = vi.fn();
      const revokeObjectURLSpy = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLSpy;
      globalThis.URL.revokeObjectURL = revokeObjectURLSpy;

      // Seed a stale errorStatus from a prior request so we can prove the
      // download handler clears it. Without the clear, the download error
      // would be rendered inside the dedicated 403 forbidden surface instead
      // of the generic red error banner.
      mockPostErrorStatus.value = 403;

      const wrapper = await mountPage();
      await flushPromises();

      const button = wrapper.find('[data-testid="post-file-download-link"]');
      expect(button.exists()).toBe(true);

      await button.trigger('click');
      await flushPromises();

      expect(createObjectURLSpy).not.toHaveBeenCalled();
      expect(revokeObjectURLSpy).not.toHaveBeenCalled();
      expect(mockPostError.value).toBe('Failed to download broken.bin');
      // The download handler must clear stale errorStatus so the generic red
      // error banner renders, NOT the dedicated 403 forbidden surface.
      expect(mockPostErrorStatus.value).toBeNull();
      expect(wrapper.find('[data-testid="forbidden-page"]').exists()).toBe(false);
      // The generic error banner now renders the message.
      expect(wrapper.text()).toContain('Failed to download broken.bin');
    });
  });

  // E2E hook (issue #52, Task 14): a synchronous render-time throw at the top
  // of <script setup> lets the ErrorBoundary spec exercise Vue's
  // onErrorCaptured path without depending on a real upstream failure mode.
  // The branch is gated on `window.__E2E__ === true` AND the URL query param
  // `errorBoundaryTest=1` — neither condition is true in normal traffic, so
  // real users never trip it.
  describe('e2e error-boundary hook', () => {
    type E2EWindow = Window & { __E2E__?: boolean };
    const originalHref = window.location.href;

    function setHref(href: string): void {
      // jsdom only allows location mutation via assignment to `window.location`
      // (read-only `href`); replace the descriptor so we can stub the URL.
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: new URL(href),
      });
    }

    function restoreHref(): void {
      Object.defineProperty(window, 'location', {
        configurable: true,
        writable: true,
        value: new URL(originalHref),
      });
    }

    afterEach(() => {
      delete (window as E2EWindow).__E2E__;
      restoreHref();
    });

    it('throws synchronously when __E2E__=true AND ?errorBoundaryTest=1', async () => {
      (window as E2EWindow).__E2E__ = true;
      setHref('http://localhost/posts/post-1?errorBoundaryTest=1');

      // The throw happens at component setup; mount() rethrows it. Use a
      // try/catch rather than rejects.toThrow because mount is sync but the
      // setup throw bubbles out as a synchronous error here.
      let captured: unknown = null;
      try {
        await mountPage();
      } catch (err) {
        captured = err;
      }
      expect(captured).toBeInstanceOf(Error);
      expect((captured as Error).message).toBe('e2e: forced render error');
    });

    it('does NOT throw when __E2E__=true but query param is missing', async () => {
      (window as E2EWindow).__E2E__ = true;
      setHref('http://localhost/posts/post-1');
      mockFetchPost.mockResolvedValue(undefined);

      const wrapper = await mountPage();
      await flushPromises();
      // Mount succeeds — boundary code path not taken.
      expect(wrapper.exists()).toBe(true);
    });

    it('does NOT throw when query param is present but __E2E__ is unset', async () => {
      // __E2E__ left undefined (afterEach cleanup keeps it deleted)
      setHref('http://localhost/posts/post-1?errorBoundaryTest=1');
      mockFetchPost.mockResolvedValue(undefined);

      const wrapper = await mountPage();
      await flushPromises();
      expect(wrapper.exists()).toBe(true);
    });
  });
});
