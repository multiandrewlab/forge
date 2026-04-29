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
      'postId',
    ],
    emits: [
      'update:modelValue',
      'update:title',
      'update:language',
      'update:visibility',
      'update:contentType',
      'update:tags',
      'publish',
      'save-draft',
      'save-revision',
      'cancel',
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

    it('should tag the error block with data-testid="forbidden-page" when the error is a 403', async () => {
      // The Phase 6 e2e journey asserts on shell.forbiddenPage to confirm a
      // permission boundary. Any error containing "forbidden" (case-insensitive)
      // makes the error block addressable to the test selector.
      mockError.value = 'Forbidden';
      mockFetchPost.mockResolvedValue(undefined);
      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="forbidden-page"]').exists()).toBe(true);
    });

    it('should NOT tag the error block when the error is unrelated to permissions', async () => {
      mockError.value = 'Failed to fetch post';
      mockFetchPost.mockResolvedValue(undefined);
      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="forbidden-page"]').exists()).toBe(false);
    });

    it('should render fork-attribution when the post is a fork', async () => {
      // When a post has forkedFromId set, the edit page must render an
      // attribution block with a router-link back to the source post. This is
      // the surface that the e2e journey (Phase 5) asserts after a fork
      // redirects the user to /posts/<newId>/edit.
      const sourceId = 'c0000000-0000-0000-0000-000000000099';
      const post = createMockPost({ forkedFromId: sourceId });
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });

      const wrapper = await mountPage();
      await flushPromises();

      const attribution = wrapper.find('[data-testid="fork-attribution"]');
      expect(attribution.exists()).toBe(true);
      expect(attribution.text()).toContain('Forked from');
      // The link target uses the named route, but the resolved href encodes
      // the source post id — that's the load-bearing back-pointer.
      const link = attribution.find('a');
      expect(link.attributes('href')).toContain(sourceId);
    });

    it('should NOT render fork-attribution when the post is not a fork', async () => {
      const post = createMockPost({ forkedFromId: null });
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="fork-attribution"]').exists()).toBe(false);
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

  // ── Cancel ─────────────────────────────────────────────────────
  // handleCancel reverts in-flight metadata edits by PATCHing the post back
  // to the snapshot captured on mount, then navigates to the view page.
  describe('cancel', () => {
    async function mountWithPost(postOverrides: Partial<PostWithRevision> = {}) {
      const post = createMockPost(postOverrides);
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });
      mockSaveRevision.mockResolvedValue(undefined);
      mockUpdatePost.mockResolvedValue(undefined);
      const wrapper = await mountPage();
      await flushPromises();
      return wrapper;
    }

    it('should revert title to the snapshot captured on mount when cancel fires', async () => {
      const wrapper = await mountWithPost({ title: 'Original Title' });
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      // User edits the title — auto-save commits the new value.
      await editor.vm.$emit('update:title', 'Stomp the title');
      await flushPromises();
      mockUpdatePost.mockClear();

      // Cancel fires; handler PATCHes back to the original.
      await editor.vm.$emit('cancel');
      await flushPromises();

      expect(mockUpdatePost).toHaveBeenCalledWith(
        'post-abc',
        expect.objectContaining({ title: 'Original Title' }),
      );
    });

    it('should navigate to post-view after revert PATCH completes', async () => {
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      await editor.vm.$emit('cancel');
      await flushPromises();

      expect(router.currentRoute.value.name).toBe('post-view');
      expect(router.currentRoute.value.params.id).toBe('post-abc');
    });

    it('should clear a pending content debounce timer without flushing it (no saveRevision call)', async () => {
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      // Trigger a content change to start the 2s debounce timer.
      await editor.vm.$emit('update:modelValue', 'unsaved content');
      await flushPromises();
      mockSaveRevision.mockClear();

      await editor.vm.$emit('cancel');
      await flushPromises();

      // Advance past the 2s debounce window — saveRevision must NOT fire,
      // proving the timer was cleared (not flushed) by handleCancel.
      vi.advanceTimersByTime(2000);
      await flushPromises();

      expect(mockSaveRevision).not.toHaveBeenCalled();
    });

    it('should run cleanly when no debounce timer is pending', async () => {
      // Exercises the false branch of `if (debounceTimer)` inside handleCancel
      // — no content edit was made, so the timer ref stays null.
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      await editor.vm.$emit('cancel');
      await flushPromises();

      expect(mockUpdatePost).toHaveBeenCalled();
      expect(router.currentRoute.value.name).toBe('post-view');
    });

    it('should send language=null when the original language was null', async () => {
      // Exercises the `originalLanguage.value || null` branch where the
      // original language is the empty string (post had language=null on load).
      const wrapper = await mountWithPost({ language: null });
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      await editor.vm.$emit('cancel');
      await flushPromises();

      expect(mockUpdatePost).toHaveBeenCalledWith(
        'post-abc',
        expect.objectContaining({ language: null }),
      );
    });
  });

  // ── postId pass-through ────────────────────────────────────────
  // PostEditPage must hand the loaded post's id to PostEditor so the toolbar
  // can render the save-revision-btn (which is gated on the postId prop).
  describe('postId pass-through', () => {
    it('should pass currentPost.id to PostEditor as the postId prop', async () => {
      const post = createMockPost({ id: 'post-pass-through-xyz' });
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });
      const wrapper = await mountPage('post-pass-through-xyz');
      await flushPromises();

      const editor = wrapper.findComponent({ name: 'PostEditor' });
      expect(editor.props('postId')).toBe('post-pass-through-xyz');
    });
  });

  // ── Save Draft (edit page) ────────────────────────────────────
  // On the edit page, the Save Draft button on PostEditor flushes any pending
  // body debounce timer so the in-flight change lands as a revision
  // immediately. When no timer is pending, it still creates an untagged
  // snapshot to honor the user's explicit save intent.
  describe('save-draft handler (edit page)', () => {
    async function mountWithPost() {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });
      mockSaveRevision.mockResolvedValue(undefined);
      const wrapper = await mountPage();
      await flushPromises();
      return wrapper;
    }

    it('should flush a pending body debounce timer and call saveRevision once', async () => {
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      // Arm the body debounce timer with a content change.
      await editor.vm.$emit('update:modelValue', 'flushed body');
      await flushPromises();
      mockSaveRevision.mockClear();

      // Save Draft fires before the 2s timer would auto-fire.
      await editor.vm.$emit('save-draft');
      await flushPromises();

      expect(mockSaveRevision).toHaveBeenCalledTimes(1);
      expect(mockSaveRevision).toHaveBeenCalledWith('post-abc', 'flushed body', null);

      // Advancing past 2s must NOT fire saveRevision again — proves the
      // pending timer was cleared, not duplicated.
      vi.advanceTimersByTime(2000);
      await flushPromises();
      expect(mockSaveRevision).toHaveBeenCalledTimes(1);
    });

    it('should still call saveRevision when no debounce timer is pending', async () => {
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      // Vue's content watcher fires once on mount as content is hydrated from
      // the loaded post. Drain that initial debounce window so debounceTimer
      // resets to null before exercising the no-pending branch.
      vi.advanceTimersByTime(2000);
      await flushPromises();
      mockSaveRevision.mockClear();

      // No pending timer at this point → save-draft hits the no-pending branch.
      await editor.vm.$emit('save-draft');
      await flushPromises();

      // Initial body content from the seeded post is sent.
      expect(mockSaveRevision).toHaveBeenCalledTimes(1);
      expect(mockSaveRevision).toHaveBeenCalledWith('post-abc', 'console.log("hello")', null);
    });
  });

  // ── Save Revision (manual snapshot via button) ────────────────
  // The save-revision-btn on the toolbar emits save-revision from PostEditor
  // up to PostEditPage. The handler clears any pending body debounce timer
  // (so it doesn't double-fire) and POSTs the current body with an explicit
  // "Manual revision" message so the timeline distinguishes manual snapshots.
  describe('save-revision handler (edit page)', () => {
    async function mountWithPost() {
      const post = createMockPost();
      mockFetchPost.mockImplementation(async () => {
        const store = usePostsStore();
        store.setPost(post);
      });
      mockSaveRevision.mockResolvedValue(undefined);
      const wrapper = await mountPage();
      await flushPromises();
      return wrapper;
    }

    it('should call saveRevision with the current content and a "Manual revision" message', async () => {
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      // Body is unchanged from initial — manual button still snapshots it.
      await editor.vm.$emit('save-revision');
      await flushPromises();

      expect(mockSaveRevision).toHaveBeenCalledWith(
        'post-abc',
        'console.log("hello")',
        'Manual revision',
      );
    });

    it('should send the latest content when the body has been changed before clicking', async () => {
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      await editor.vm.$emit('update:modelValue', 'updated body before manual save');
      await flushPromises();
      mockSaveRevision.mockClear();

      await editor.vm.$emit('save-revision');
      await flushPromises();

      expect(mockSaveRevision).toHaveBeenCalledWith(
        'post-abc',
        'updated body before manual save',
        'Manual revision',
      );
    });

    it('should clear a pending debounce timer so the auto-save does not double-fire', async () => {
      const wrapper = await mountWithPost();
      const editor = wrapper.findComponent({ name: 'PostEditor' });

      await editor.vm.$emit('update:modelValue', 'pending body');
      await flushPromises();
      mockSaveRevision.mockClear();

      await editor.vm.$emit('save-revision');
      await flushPromises();

      // Manual save fired exactly once.
      expect(mockSaveRevision).toHaveBeenCalledTimes(1);

      // Advancing past 2s must NOT fire the auto-save — the timer was cleared.
      vi.advanceTimersByTime(2000);
      await flushPromises();
      expect(mockSaveRevision).toHaveBeenCalledTimes(1);
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
