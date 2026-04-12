import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import { ref } from 'vue';
import type { Router } from 'vue-router';
import type { Pinia } from 'pinia';
import type { Ref } from 'vue';

// ── Mocks ──────────────────────────────────────────────────────────
// Mock PostEditor to avoid loading CodeMirror
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

const mockCreatePost = vi.fn();
const mockSaveRevision = vi.fn();
const mockError: Ref<string | null> = ref(null);

vi.mock('@/composables/usePosts', () => ({
  usePosts: () => ({
    createPost: mockCreatePost,
    saveRevision: mockSaveRevision,
    error: mockError,
  }),
}));

const mockDetectLanguage = vi.fn();

vi.mock('@/lib/detectLanguage', () => ({
  detectLanguage: (...args: unknown[]) => mockDetectLanguage(...args),
}));

import PostNewPage from '@/pages/PostNewPage.vue';

// ── Helpers ────────────────────────────────────────────────────────
function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
      { path: '/posts/new', name: 'post-new', component: PostNewPage },
      {
        path: '/posts/:id/edit',
        name: 'post-edit',
        component: { template: '<div>Edit</div>' },
      },
    ],
  });
}

describe('PostNewPage', () => {
  let pinia: Pinia;
  let router: Router;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = createTestRouter();
    mockCreatePost.mockReset();
    mockSaveRevision.mockReset();
    mockDetectLanguage.mockReset();
    mockError.value = null;
  });

  async function mountPage() {
    router.push('/posts/new');
    await router.isReady();
    return mount(PostNewPage, {
      global: { plugins: [pinia, router] },
    });
  }

  // ── Rendering ──────────────────────────────────────────────────
  describe('rendering', () => {
    it('should render PostEditor component', async () => {
      const wrapper = await mountPage();
      expect(wrapper.find('[data-testid="post-editor-stub"]').exists()).toBe(true);
    });

    it('should render "Back to Workspace" link pointing to /', async () => {
      const wrapper = await mountPage();
      const link = wrapper.find('a[href="/"]');
      expect(link.exists()).toBe(true);
      expect(link.text()).toContain('Back to Workspace');
    });

    it('should not display error when error is null', async () => {
      const wrapper = await mountPage();
      expect(wrapper.find('.bg-red-900\\/30').exists()).toBe(false);
    });

    it('should display error message when error is set', async () => {
      mockError.value = 'Something went wrong';
      const wrapper = await mountPage();
      expect(wrapper.text()).toContain('Something went wrong');
    });
  });

  // ── Publish / Create ──────────────────────────────────────────
  describe('publish', () => {
    it('should call createPost and redirect to edit page on successful publish', async () => {
      mockCreatePost.mockResolvedValue('post-123');
      mockSaveRevision.mockResolvedValue(undefined);
      const wrapper = await mountPage();

      const editor = wrapper.findComponent({ name: 'PostEditor' });
      await editor.vm.$emit('publish');
      await flushPromises();

      expect(mockCreatePost).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Untitled',
          contentType: 'snippet',
          visibility: 'public',
        }),
      );
      expect(router.currentRoute.value.name).toBe('post-edit');
      expect(router.currentRoute.value.params.id).toBe('post-123');
    });

    it('should not redirect when createPost returns null', async () => {
      mockCreatePost.mockResolvedValue(null);
      const wrapper = await mountPage();

      const editor = wrapper.findComponent({ name: 'PostEditor' });
      await editor.vm.$emit('publish');
      await flushPromises();

      expect(router.currentRoute.value.name).toBe('post-new');
    });

    it('should use entered title rather than "Untitled" when title is provided', async () => {
      mockCreatePost.mockResolvedValue('post-456');
      mockSaveRevision.mockResolvedValue(undefined);
      const wrapper = await mountPage();

      const editor = wrapper.findComponent({ name: 'PostEditor' });
      await editor.vm.$emit('update:title', 'My Title');
      await editor.vm.$emit('publish');
      await flushPromises();

      expect(mockCreatePost).toHaveBeenCalledWith(expect.objectContaining({ title: 'My Title' }));
    });
  });

  // ── Language auto-detection ───────────────────────────────────
  describe('language auto-detection', () => {
    it('should call detectLanguage when content changes', async () => {
      mockDetectLanguage.mockReturnValue('javascript');
      const wrapper = await mountPage();

      const editor = wrapper.findComponent({ name: 'PostEditor' });
      await editor.vm.$emit('update:modelValue', 'const x = 1;');
      await flushPromises();

      expect(mockDetectLanguage).toHaveBeenCalledWith('const x = 1;');
    });

    it('should update language from detected value', async () => {
      mockDetectLanguage.mockReturnValue('python');
      const wrapper = await mountPage();

      const editor = wrapper.findComponent({ name: 'PostEditor' });
      await editor.vm.$emit('update:modelValue', 'def foo(): pass');
      await flushPromises();

      expect(editor.props('language')).toBe('python');
    });

    it('should not overwrite language when manually set', async () => {
      mockDetectLanguage.mockReturnValue('javascript');
      const wrapper = await mountPage();

      const editor = wrapper.findComponent({ name: 'PostEditor' });

      // Manually set language first
      await editor.vm.$emit('update:language', 'typescript');
      await flushPromises();

      // Then change content — detection should be skipped
      await editor.vm.$emit('update:modelValue', 'const x = 1;');
      await flushPromises();

      expect(editor.props('language')).toBe('typescript');
    });

    it('should re-enable auto-detection when language is cleared', async () => {
      mockDetectLanguage.mockReturnValue('javascript');
      const wrapper = await mountPage();

      const editor = wrapper.findComponent({ name: 'PostEditor' });

      // Manually set then clear
      await editor.vm.$emit('update:language', 'typescript');
      await editor.vm.$emit('update:language', '');
      await flushPromises();

      // Now content change should trigger detection again
      await editor.vm.$emit('update:modelValue', 'const x = 1;');
      await flushPromises();

      expect(editor.props('language')).toBe('javascript');
    });

    it('should not update language when detectLanguage returns null', async () => {
      mockDetectLanguage.mockReturnValue(null);
      const wrapper = await mountPage();

      const editor = wrapper.findComponent({ name: 'PostEditor' });
      await editor.vm.$emit('update:modelValue', 'hello');
      await flushPromises();

      expect(editor.props('language')).toBe('');
    });
  });
});
