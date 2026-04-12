import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { mount, VueWrapper, flushPromises } from '@vue/test-utils';
import EditorToolbar from '@/components/editor/EditorToolbar.vue';
import type { Tag } from '@forge/shared';

// --- Mock useTags composable ---
const mockSearchTags = vi.fn<(query: string, limit?: number) => Promise<Tag[]>>();

vi.mock('@/composables/useTags', () => ({
  useTags: () => ({
    searchTags: mockSearchTags,
  }),
}));

describe('EditorToolbar', () => {
  const defaultProps = {
    language: 'javascript',
    visibility: 'public' as const,
    contentType: 'snippet' as const,
    tags: [] as string[],
  };

  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.useFakeTimers();
    mockSearchTags.mockReset();
    mockSearchTags.mockResolvedValue([]);
    wrapper = mount(EditorToolbar, { props: { ...defaultProps } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('language picker', () => {
    it('should render a language select element', () => {
      const select = wrapper.find('[data-testid="language-select"]');
      expect(select.exists()).toBe(true);
    });

    it('should display the current language as selected', () => {
      const select = wrapper.find('[data-testid="language-select"]');
      expect((select.element as HTMLSelectElement).value).toBe('javascript');
    });

    it('should emit update:language when language changes', async () => {
      const select = wrapper.find('[data-testid="language-select"]');
      await select.setValue('python');

      const emitted = wrapper.emitted('update:language');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual(['python']);
    });

    it('should include all supported languages as options', () => {
      const options = wrapper.findAll('[data-testid="language-select"] option');
      const languages = options.map((o) => o.attributes('value'));
      expect(languages).toContain('javascript');
      expect(languages).toContain('typescript');
      expect(languages).toContain('python');
      expect(languages).toContain('rust');
      expect(languages).toContain('sql');
    });
  });

  describe('content type selector', () => {
    it('should render a content type select element', () => {
      const select = wrapper.find('[data-testid="content-type-select"]');
      expect(select.exists()).toBe(true);
    });

    it('should display the current content type as selected', () => {
      const select = wrapper.find('[data-testid="content-type-select"]');
      expect((select.element as HTMLSelectElement).value).toBe('snippet');
    });

    it('should emit update:contentType when content type changes', async () => {
      const select = wrapper.find('[data-testid="content-type-select"]');
      await select.setValue('prompt');

      const emitted = wrapper.emitted('update:contentType');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual(['prompt']);
    });

    it('should include all content type options', () => {
      const options = wrapper.findAll('[data-testid="content-type-select"] option');
      const values = options.map((o) => o.attributes('value'));
      expect(values).toContain('snippet');
      expect(values).toContain('prompt');
      expect(values).toContain('document');
      expect(values).toContain('link');
    });
  });

  describe('visibility toggle', () => {
    it('should render a visibility toggle button', () => {
      const button = wrapper.find('[data-testid="visibility-toggle"]');
      expect(button.exists()).toBe(true);
    });

    it('should display "Public" when visibility is public', () => {
      const button = wrapper.find('[data-testid="visibility-toggle"]');
      expect(button.text()).toBe('Public');
    });

    it('should display "Private" when visibility is private', () => {
      const privateWrapper = mount(EditorToolbar, {
        props: { ...defaultProps, visibility: 'private' as const },
      });
      const button = privateWrapper.find('[data-testid="visibility-toggle"]');
      expect(button.text()).toBe('Private');
    });

    it('should apply green styling when public', () => {
      const button = wrapper.find('[data-testid="visibility-toggle"]');
      expect(button.classes()).toContain('text-green-400');
      expect(button.classes()).toContain('border-green-500');
    });

    it('should apply yellow styling when private', () => {
      const privateWrapper = mount(EditorToolbar, {
        props: { ...defaultProps, visibility: 'private' as const },
      });
      const button = privateWrapper.find('[data-testid="visibility-toggle"]');
      expect(button.classes()).toContain('text-yellow-400');
      expect(button.classes()).toContain('border-yellow-500');
    });

    it('should emit update:visibility toggling from public to private', async () => {
      const button = wrapper.find('[data-testid="visibility-toggle"]');
      await button.trigger('click');

      const emitted = wrapper.emitted('update:visibility');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual(['private']);
    });

    it('should emit update:visibility toggling from private to public', async () => {
      const privateWrapper = mount(EditorToolbar, {
        props: { ...defaultProps, visibility: 'private' as const },
      });
      const button = privateWrapper.find('[data-testid="visibility-toggle"]');
      await button.trigger('click');

      const emitted = privateWrapper.emitted('update:visibility');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual(['public']);
    });
  });

  describe('tag input', () => {
    it('should render a tag input field', () => {
      const input = wrapper.find('[data-testid="tag-input"]');
      expect(input.exists()).toBe(true);
    });

    it('should add a tag on Enter key press', async () => {
      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('vue');
      await input.trigger('keydown.enter');

      const emitted = wrapper.emitted('update:tags');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual([['vue']]);
    });

    it('should not add empty tags', async () => {
      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('   ');
      await input.trigger('keydown.enter');

      const emitted = wrapper.emitted('update:tags');
      expect(emitted).toBeUndefined();
    });

    it('should not add duplicate tags', async () => {
      const tagWrapper = mount(EditorToolbar, {
        props: { ...defaultProps, tags: ['vue'] },
      });
      const input = tagWrapper.find('[data-testid="tag-input"]');
      await input.setValue('vue');
      await input.trigger('keydown.enter');

      const emitted = tagWrapper.emitted('update:tags');
      expect(emitted).toBeUndefined();
    });

    it('should display existing tags', () => {
      const tagWrapper = mount(EditorToolbar, {
        props: { ...defaultProps, tags: ['vue', 'typescript'] },
      });
      const tags = tagWrapper.findAll('[data-testid="tag-item"]');
      expect(tags).toHaveLength(2);
      expect(tags[0].text()).toContain('vue');
      expect(tags[1].text()).toContain('typescript');
    });

    it('should remove a tag when remove button is clicked', async () => {
      const tagWrapper = mount(EditorToolbar, {
        props: { ...defaultProps, tags: ['vue', 'typescript'] },
      });
      const removeButtons = tagWrapper.findAll('[data-testid="tag-remove"]');
      await removeButtons[0].trigger('click');

      const emitted = tagWrapper.emitted('update:tags');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual([['typescript']]);
    });

    it('should hide tag input when 10 tags are present', () => {
      const tenTags = Array.from({ length: 10 }, (_, i) => `tag${i}`);
      const tagWrapper = mount(EditorToolbar, {
        props: { ...defaultProps, tags: tenTags },
      });
      const input = tagWrapper.find('[data-testid="tag-input"]');
      expect(input.exists()).toBe(false);
    });

    it('should show tag input when fewer than 10 tags', () => {
      const nineTags = Array.from({ length: 9 }, (_, i) => `tag${i}`);
      const tagWrapper = mount(EditorToolbar, {
        props: { ...defaultProps, tags: nineTags },
      });
      const input = tagWrapper.find('[data-testid="tag-input"]');
      expect(input.exists()).toBe(true);
    });

    it('should clear input after adding a tag', async () => {
      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('vue');
      await input.trigger('keydown.enter');

      expect((input.element as HTMLInputElement).value).toBe('');
    });

    it('should trim whitespace from tags before adding', async () => {
      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('  vue  ');
      await input.trigger('keydown.enter');

      const emitted = wrapper.emitted('update:tags');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual([['vue']]);
    });
  });

  describe('tag autocomplete', () => {
    const mockTags: Tag[] = [
      { id: '1', name: 'vue', postCount: 5 },
      { id: '2', name: 'vuex', postCount: 3 },
      { id: '3', name: 'vue-router', postCount: 2 },
    ];

    it('should call searchTags after debounce when typing in input', async () => {
      mockSearchTags.mockResolvedValue(mockTags);

      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('vu');

      // Should not call immediately
      expect(mockSearchTags).not.toHaveBeenCalled();

      // Advance past the debounce delay
      vi.advanceTimersByTime(200);
      await flushPromises();

      expect(mockSearchTags).toHaveBeenCalledWith('vu', 10);
    });

    it('should not call searchTags for empty input', async () => {
      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('');

      vi.advanceTimersByTime(200);
      await flushPromises();

      expect(mockSearchTags).not.toHaveBeenCalled();
    });

    it('should not call searchTags for whitespace-only input', async () => {
      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('   ');

      vi.advanceTimersByTime(200);
      await flushPromises();

      expect(mockSearchTags).not.toHaveBeenCalled();
    });

    it('should debounce multiple keystrokes and only call searchTags once', async () => {
      mockSearchTags.mockResolvedValue(mockTags);

      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('v');
      vi.advanceTimersByTime(100);
      await input.setValue('vu');
      vi.advanceTimersByTime(100);
      await input.setValue('vue');

      vi.advanceTimersByTime(200);
      await flushPromises();

      expect(mockSearchTags).toHaveBeenCalledTimes(1);
      expect(mockSearchTags).toHaveBeenCalledWith('vue', 10);
    });

    it('should display suggestions dropdown when results are returned', async () => {
      mockSearchTags.mockResolvedValue(mockTags);

      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('vu');
      vi.advanceTimersByTime(200);
      await flushPromises();

      const dropdown = wrapper.find('[data-testid="tag-suggestions"]');
      expect(dropdown.exists()).toBe(true);

      const items = wrapper.findAll('[data-testid="tag-suggestion-item"]');
      expect(items).toHaveLength(3);
      expect(items[0].text()).toContain('vue');
      expect(items[1].text()).toContain('vuex');
      expect(items[2].text()).toContain('vue-router');
    });

    it('should display post count in suggestions', async () => {
      mockSearchTags.mockResolvedValue(mockTags);

      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('vu');
      vi.advanceTimersByTime(200);
      await flushPromises();

      const items = wrapper.findAll('[data-testid="tag-suggestion-item"]');
      expect(items[0].text()).toContain('5');
      expect(items[1].text()).toContain('3');
      expect(items[2].text()).toContain('2');
    });

    it('should not show dropdown when there are no suggestions and input is empty', async () => {
      mockSearchTags.mockResolvedValue([]);

      const dropdown = wrapper.find('[data-testid="tag-suggestions"]');
      expect(dropdown.exists()).toBe(false);
    });

    it('should add tag when clicking a suggestion', async () => {
      mockSearchTags.mockResolvedValue(mockTags);

      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('vu');
      vi.advanceTimersByTime(200);
      await flushPromises();

      const items = wrapper.findAll('[data-testid="tag-suggestion-item"]');
      await items[1].trigger('click');

      const emitted = wrapper.emitted('update:tags');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual([['vuex']]);
    });

    it('should clear input and hide suggestions after selecting a suggestion', async () => {
      mockSearchTags.mockResolvedValue(mockTags);

      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('vu');
      vi.advanceTimersByTime(200);
      await flushPromises();

      const items = wrapper.findAll('[data-testid="tag-suggestion-item"]');
      await items[0].trigger('click');

      expect((input.element as HTMLInputElement).value).toBe('');

      const dropdown = wrapper.find('[data-testid="tag-suggestions"]');
      expect(dropdown.exists()).toBe(false);
    });

    it('should add typed tag on Enter when no suggestions match', async () => {
      mockSearchTags.mockResolvedValue([]);

      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('newtag');
      vi.advanceTimersByTime(200);
      await flushPromises();

      await input.trigger('keydown.enter');

      const emitted = wrapper.emitted('update:tags');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual([['newtag']]);
    });

    it('should clear suggestions after adding a tag via Enter', async () => {
      mockSearchTags.mockResolvedValue(mockTags);

      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('vue');
      vi.advanceTimersByTime(200);
      await flushPromises();

      // Suggestions should be visible
      expect(wrapper.find('[data-testid="tag-suggestions"]').exists()).toBe(true);

      await input.trigger('keydown.enter');

      // Suggestions should be cleared
      expect(wrapper.find('[data-testid="tag-suggestions"]').exists()).toBe(false);
    });

    it('should add a non-duplicate tag from filtered suggestion list', async () => {
      const tagWrapper = mount(EditorToolbar, {
        props: { ...defaultProps, tags: ['vue'] },
      });

      mockSearchTags.mockResolvedValue(mockTags);

      const input = tagWrapper.find('[data-testid="tag-input"]');
      await input.setValue('vu');
      vi.advanceTimersByTime(200);
      await flushPromises();

      // After filtering, items[0] is 'vuex' (not 'vue'), so clicking it adds a valid tag
      const items = tagWrapper.findAll('[data-testid="tag-suggestion-item"]');
      expect(items).toHaveLength(2); // vue is filtered out, vuex and vue-router remain
      await items[0].trigger('click');

      const emitted = tagWrapper.emitted('update:tags');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual([['vue', 'vuex']]);
    });

    it('should guard against duplicate when props change between render and click', async () => {
      // Simulate race condition: suggestions render, then props update to include a tag,
      // then user clicks the now-stale suggestion item before Vue re-renders.
      const tagWrapper = mount(EditorToolbar, {
        props: { ...defaultProps, tags: [] },
      });

      mockSearchTags.mockResolvedValue(mockTags);

      const input = tagWrapper.find('[data-testid="tag-input"]');
      await input.setValue('vu');
      vi.advanceTimersByTime(200);
      await flushPromises();

      // Suggestions are rendered with 3 items
      const items = tagWrapper.findAll('[data-testid="tag-suggestion-item"]');
      expect(items).toHaveLength(3);

      // Props update: 'vue' is now already in tags (simulating concurrent add)
      await tagWrapper.setProps({ tags: ['vue'] });

      // Click the first suggestion which was 'vue' before re-render.
      // The click handler calls selectSuggestion with the original Tag object.
      await items[0].trigger('click');

      // The guard in selectSuggestion prevents duplicate emission
      const emitted = tagWrapper.emitted('update:tags');
      expect(emitted).toBeUndefined();
    });

    it('should filter out already-selected tags from suggestions', async () => {
      const tagWrapper = mount(EditorToolbar, {
        props: { ...defaultProps, tags: ['vue'] },
      });

      mockSearchTags.mockResolvedValue(mockTags);

      const input = tagWrapper.find('[data-testid="tag-input"]');
      await input.setValue('vu');
      vi.advanceTimersByTime(200);
      await flushPromises();

      const items = tagWrapper.findAll('[data-testid="tag-suggestion-item"]');
      // 'vue' is already selected, so only vuex and vue-router should show
      expect(items).toHaveLength(2);
      expect(items[0].text()).toContain('vuex');
      expect(items[1].text()).toContain('vue-router');
    });

    it('should hide suggestions when input is cleared', async () => {
      mockSearchTags.mockResolvedValue(mockTags);

      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('vu');
      vi.advanceTimersByTime(200);
      await flushPromises();

      expect(wrapper.find('[data-testid="tag-suggestions"]').exists()).toBe(true);

      await input.setValue('');
      vi.advanceTimersByTime(200);
      await flushPromises();

      expect(wrapper.find('[data-testid="tag-suggestions"]').exists()).toBe(false);
    });

    it('should handle searchTags errors gracefully', async () => {
      mockSearchTags.mockRejectedValue(new Error('Network error'));

      const input = wrapper.find('[data-testid="tag-input"]');
      await input.setValue('vu');
      vi.advanceTimersByTime(200);
      await flushPromises();

      // Should not show dropdown on error
      const dropdown = wrapper.find('[data-testid="tag-suggestions"]');
      expect(dropdown.exists()).toBe(false);
    });

    it('should not show suggestions dropdown when all results are already selected', async () => {
      const tagWrapper = mount(EditorToolbar, {
        props: { ...defaultProps, tags: ['vue', 'vuex', 'vue-router'] },
      });

      mockSearchTags.mockResolvedValue(mockTags);

      const input = tagWrapper.find('[data-testid="tag-input"]');
      await input.setValue('vu');
      vi.advanceTimersByTime(200);
      await flushPromises();

      const dropdown = tagWrapper.find('[data-testid="tag-suggestions"]');
      expect(dropdown.exists()).toBe(false);
    });
  });
});
