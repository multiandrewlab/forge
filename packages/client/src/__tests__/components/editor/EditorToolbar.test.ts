import { describe, it, expect, beforeEach } from 'vitest';
import { mount, VueWrapper } from '@vue/test-utils';
import EditorToolbar from '@/components/editor/EditorToolbar.vue';

describe('EditorToolbar', () => {
  const defaultProps = {
    language: 'javascript',
    visibility: 'public' as const,
    contentType: 'snippet' as const,
    tags: [] as string[],
  };

  let wrapper: VueWrapper;

  beforeEach(() => {
    wrapper = mount(EditorToolbar, { props: { ...defaultProps } });
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
});
