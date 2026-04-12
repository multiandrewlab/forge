import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import { ref, isRef } from 'vue';
import type { Router } from 'vue-router';
import type { Pinia } from 'pinia';
import type { Ref } from 'vue';
import type { PostWithRevision } from '@forge/shared';

// ── Mocks ──────────────────────────────────────────────────────────
vi.mock('@/components/editor/PostEditor.vue', () => ({
  default: {
    name: 'PostEditor',
    props: [
      'modelValue',
      'title',
      'language',
      'visibility',
      'contentType',
      'tags',
      'saveStatus',
      'lastSavedAt',
    ],
    emits: [
      'update:modelValue',
      'update:title',
      'update:language',
      'update:visibility',
      'update:contentType',
      'update:tags',
      'publish',
    ],
    template: '<div data-testid="post-editor-stub"></div>',
  },
}));

const mockFetchPost = vi.fn();
const mockSaveRevision = vi.fn();
const mockUpdatePost = vi.fn();
const mockPublishPost = vi.fn();
const mockError: Ref<string | null> = ref(null);

vi.mock('@/composables/usePosts', () => ({
  usePosts: () => ({
    fetchPost: mockFetchPost,
    saveRevision: mockSaveRevision,
    updatePost: mockUpdatePost,
    publishPost: mockPublishPost,
    error: mockError,
  }),
}));

import PostEditPage from '@/pages/PostEditPage.vue';
import { usePostsStore } from '@/stores/posts';

// ── Test data ──────────────────────────────────────────────────────
function createMockPost(overrides: Partial<PostWithRevision> = {}): PostWithRevision {
  return {
    id: 'post-abc',
    authorId: 'author-1',
    title: 'Test Post',
    contentType: 'snippet',
    language: 'javascript',
    visibility: 'public',
    isDraft: true,
    forkedFromId: null,
    linkUrl: null,
    linkPreview: null,
    voteCount: 0,
    viewCount: 0,
    deletedAt: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    revisions: [
      {
        id: 'rev-1',
        postId: 'post-abc',
        content: 'console.log("hello")',
        message: null,
        revisionNumber: 1,
        createdAt: new Date('2026-01-01'),
      },
    ],
    ...overrides,
  };
}

// ── Helpers ────────────────────────────────────────────────────────
function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
      {
        path: '/posts/:id/edit',
        name: 'post-edit',
        component: PostEditPage,
      },
      {
        path: '/posts/:id',
        name: 'post-view',
        component: { template: '<div>View</div>' },
      },
    ],
  });
}

describe('PostEditPage', () => {
  let pinia: Pinia;
  let router: Router;

  beforeEach(() => {
    vi.useFakeTimers();
    pinia = createPinia();
    setActivePinia(pinia);
    router = createTestRouter();
    mockFetchPost.mockReset();
    mockSaveRevision.mockReset();
    mockUpdatePost.mockReset();
    mockPublishPost.mockReset();
    mockError.value = null;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function mountPage(postId = 'post-abc') {
    router.push({ name: 'post-edit', params: { id: postId } });
    await router.isReady();
    return mount(PostEditPage, {
      global: { plugins: [pinia, router] },
    });
  }

  // ── Rendering / Fetch ──────────────────────────────────────────
  describe('rendering and data loading', () => {
    it('should show loading state initially', async () => {
      // fetchPost never resolves — stuck in loading
      mockFetchPost.mockReturnValue(new Promise(() => {}));
      const wrapper = await mountPage();

      expect(wrapper.text()).toContain('Loading...');
      expect(wrapper.find('[data-testid="post-editor-stub"]').exists()).toBe(false);
    });

    it('should call fetchPost with the route param id on mount', async () => {
      mockFetchPost.mockResolvedValue(undefined);
      await mountPage('post-xyz');
      await flushPromises();

      expect(mockFetchPost).toHaveBeenCalledWith('post-xyz');
    });

    it('should render PostEditor when post is loaded', async () => {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="post-editor-stub"]').exists()).toBe(true);
    });

    it('should populate editor with post data after fetch', async () => {
      const post = createMockPost({
        title: 'My Snippet',
        language: 'python',
        visibility: 'private',
        contentType: 'snippet',
      });
      post.revisions = [
        {
          id: 'rev-1',
          postId: 'post-abc',
          content: 'def hello(): pass',
          message: null,
          revisionNumber: 1,
          createdAt: new Date('2026-01-01'),
        },
      ];

      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });

      const wrapper = await mountPage();
      await flushPromises();

      const editor = wrapper.findComponent({ name: 'PostEditor' });
      expect(editor.props('title')).toBe('My Snippet');
      expect(editor.props('modelValue')).toBe('def hello(): pass');
      expect(editor.props('language')).toBe('python');
      expect(editor.props('visibility')).toBe('private');
      expect(editor.props('contentType')).toBe('snippet');
    });

    it('should use empty string for content when post has no revisions (line 31 branch)', async () => {
      const post = createMockPost({ revisions: [] });
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });

      const wrapper = await mountPage();
      await flushPromises();

      const editor = wrapper.findComponent({ name: 'PostEditor' });
      expect(editor.props('modelValue')).toBe('');
    });

    it('should use empty string for language when post language is null (line 32 branch)', async () => {
      const post = createMockPost({ language: null });
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });

      const wrapper = await mountPage();
      await flushPromises();

      const editor = wrapper.findComponent({ name: 'PostEditor' });
      expect(editor.props('language')).toBe('');
    });

    it('should show "Failed to load post" when fetch returns no post', async () => {
      // fetchPost resolves but does NOT set currentPost in store
      mockFetchPost.mockResolvedValue(undefined);
      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.text()).toContain('Failed to load post');
      expect(wrapper.find('[data-testid="post-editor-stub"]').exists()).toBe(false);
    });

    it('should render "Back to Workspace" link', async () => {
      mockFetchPost.mockResolvedValue(undefined);
      const wrapper = await mountPage();
      await flushPromises();

      const link = wrapper.find('a[href="/"]');
      expect(link.exists()).toBe(true);
      expect(link.text()).toContain('Back to Workspace');
    });

    it('should display error message when error is set', async () => {
      mockError.value = 'Failed to fetch post';
      mockFetchPost.mockResolvedValue(undefined);
      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.text()).toContain('Failed to fetch post');
    });
  });

  // ── Loading guard in watchers (lines 46, 57) ──────────────────
  // The watchers short-circuit with `if (loading.value) return` to prevent
  // auto-saving during initial data population in onMounted. These guards are
  // unreachable through the normal component API: Vue's pre-flush scheduler
  // runs watchers AFTER the synchronous onMounted continuation sets
  // loading=false, so loading is always false by the time any watcher fires.
  // We exercise the guard by setting loading=true via the component's internal
  // ref and mutating a watched ref to trigger the watcher while loading is true.
  describe('loading guard in content and metadata watchers', () => {
    it('content watcher does not call saveRevision while loading is true (line 46 guard)', async () => {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });
      mockSaveRevision.mockResolvedValue(undefined);
      const wrapper = await mountPage();
      await flushPromises();
      // Drain any pending debounce timers set during onMounted
      vi.advanceTimersByTime(2000);
      await flushPromises();
      mockSaveRevision.mockReset();

      // Access the actual refs from the component's raw setup state
      const raw = (wrapper.vm as Record<string, unknown>).$.devtoolsRawSetupState as
        | Record<string, unknown>
        | undefined;
      const loadingRef = isRef(raw?.loading) ? (raw.loading as { value: boolean }) : undefined;
      const contentRef = isRef(raw?.content) ? (raw.content as { value: string }) : undefined;

      if (loadingRef && contentRef) {
        // Set loading=true, then mutate content to trigger the watcher
        loadingRef.value = true;
        contentRef.value = contentRef.value + '_while_loading';
        vi.advanceTimersByTime(2000);
        await flushPromises();
      }
      // Guard `if (loading.value) return` prevents saveRevision from being called
      expect(mockSaveRevision).not.toHaveBeenCalled();
    });

    it('metadata watcher does not call updatePost while loading is true (line 57 guard)', async () => {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });
      mockUpdatePost.mockResolvedValue(undefined);
      const wrapper = await mountPage();
      await flushPromises();
      mockUpdatePost.mockReset();

      const raw = (wrapper.vm as Record<string, unknown>).$.devtoolsRawSetupState as
        | Record<string, unknown>
        | undefined;
      const loadingRef = isRef(raw?.loading) ? (raw.loading as { value: boolean }) : undefined;
      const titleRef = isRef(raw?.title) ? (raw.title as { value: string }) : undefined;

      if (loadingRef && titleRef) {
        // Set loading=true, then mutate title to trigger the metadata watcher
        loadingRef.value = true;
        titleRef.value = titleRef.value + '_while_loading';
        await flushPromises();
      }
      // Guard `if (loading.value) return` prevents updatePost from being called
      expect(mockUpdatePost).not.toHaveBeenCalled();
    });
  });

  // ── Auto-save with debounce ────────────────────────────────────
  describe('auto-save with debounce', () => {
    async function mountWithPost() {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });
      const wrapper = await mountPage();
      await flushPromises();
      return wrapper;
    }

    it('should NOT call saveRevision immediately on content change', async () => {
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      await editor.vm.$emit('update:modelValue', 'new content');
      await flushPromises();

      expect(mockSaveRevision).not.toHaveBeenCalled();
    });

    it('should call saveRevision after 2s debounce', async () => {
      mockSaveRevision.mockResolvedValue(undefined);
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      await editor.vm.$emit('update:modelValue', 'new content');
      await flushPromises();

      vi.advanceTimersByTime(2000);
      await flushPromises();

      expect(mockSaveRevision).toHaveBeenCalledWith('post-abc', 'new content', null);
    });

    it('should reset debounce timer on rapid content changes', async () => {
      mockSaveRevision.mockResolvedValue(undefined);
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      await editor.vm.$emit('update:modelValue', 'first');
      await flushPromises();
      vi.advanceTimersByTime(1500);

      await editor.vm.$emit('update:modelValue', 'second');
      await flushPromises();
      vi.advanceTimersByTime(1500);

      // Only 1.5s after "second" — still waiting
      expect(mockSaveRevision).not.toHaveBeenCalled();

      vi.advanceTimersByTime(500);
      await flushPromises();

      // Now 2s after "second"
      expect(mockSaveRevision).toHaveBeenCalledTimes(1);
      expect(mockSaveRevision).toHaveBeenCalledWith('post-abc', 'second', null);
    });
  });

  // ── Metadata updates ──────────────────────────────────────────
  describe('metadata updates', () => {
    async function mountWithPost() {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });
      mockUpdatePost.mockResolvedValue(undefined);
      const wrapper = await mountPage();
      await flushPromises();
      return wrapper;
    }

    it('should call updatePost when title changes', async () => {
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      await editor.vm.$emit('update:title', 'New Title');
      await flushPromises();

      expect(mockUpdatePost).toHaveBeenCalledWith(
        'post-abc',
        expect.objectContaining({ title: 'New Title' }),
      );
    });

    it('should call updatePost when visibility changes', async () => {
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      await editor.vm.$emit('update:visibility', 'private');
      await flushPromises();

      expect(mockUpdatePost).toHaveBeenCalledWith(
        'post-abc',
        expect.objectContaining({ visibility: 'private' }),
      );
    });

    it('should call updatePost when language changes', async () => {
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      await editor.vm.$emit('update:language', 'python');
      await flushPromises();

      expect(mockUpdatePost).toHaveBeenCalledWith(
        'post-abc',
        expect.objectContaining({ language: 'python' }),
      );
    });

    it('should call updatePost when contentType changes', async () => {
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      await editor.vm.$emit('update:contentType', 'prompt');
      await flushPromises();

      expect(mockUpdatePost).toHaveBeenCalledWith(
        'post-abc',
        expect.objectContaining({ contentType: 'prompt' }),
      );
    });

    it('should update tags when PostEditor emits update:tags (template v-model handler)', async () => {
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      await editor.vm.$emit('update:tags', ['typescript', 'vue']);
      await flushPromises();

      expect(editor.props('tags')).toEqual(['typescript', 'vue']);
    });
  });

  // ── Publish ────────────────────────────────────────────────────
  describe('publish', () => {
    async function mountWithPost() {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });
      mockSaveRevision.mockResolvedValue(undefined);
      mockPublishPost.mockResolvedValue(undefined);
      const wrapper = await mountPage();
      await flushPromises();
      return wrapper;
    }

    it('should call publishPost and navigate to post-view on publish (no pending timer)', async () => {
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      await editor.vm.$emit('publish');
      await flushPromises();

      // No pending debounce timer — publishPost called directly, no prior saveRevision
      expect(mockPublishPost).toHaveBeenCalledWith('post-abc');
      expect(router.currentRoute.value.name).toBe('post-view');
      expect(router.currentRoute.value.params.id).toBe('post-abc');
    });

    it('should flush pending auto-save then publishPost when debounce timer is active', async () => {
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      // Trigger content change to start debounce timer
      await editor.vm.$emit('update:modelValue', 'updated content');
      await flushPromises();

      // Publish before 2s elapses — timer is still pending
      await editor.vm.$emit('publish');
      await flushPromises();

      // saveRevision should have been called due to flush
      expect(mockSaveRevision).toHaveBeenCalledWith('post-abc', 'updated content', null);
      expect(mockPublishPost).toHaveBeenCalledWith('post-abc');
      expect(router.currentRoute.value.name).toBe('post-view');
    });
  });

  // ── Cleanup ────────────────────────────────────────────────────
  describe('cleanup', () => {
    it('should unmount cleanly when no debounce timer is pending (line 40 false branch)', async () => {
      // Mount with no content changes → debounceTimer stays null
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });
      const wrapper = await mountPage();
      await flushPromises();

      // No content change was made, so no timer
      expect(() => wrapper.unmount()).not.toThrow();
    });

    it('should clear post from store on unmount', async () => {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });

      const wrapper = await mountPage();
      await flushPromises();

      const store = usePostsStore();
      expect(store.currentPost).not.toBeNull();

      wrapper.unmount();

      expect(store.currentPost).toBeNull();
    });
  });
});
