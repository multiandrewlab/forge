import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';

// Mock child components to avoid loading CodeMirror
vi.mock('@/components/editor/CodeEditor.vue', () => ({
  default: {
    name: 'CodeEditor',
    props: ['modelValue', 'language', 'readonly'],
    emits: ['update:modelValue'],
    template: '<div data-testid="code-editor-stub"></div>',
  },
}));

vi.mock('@/components/editor/EditorToolbar.vue', () => ({
  default: {
    name: 'EditorToolbar',
    props: ['language', 'visibility', 'contentType', 'tags'],
    emits: ['update:language', 'update:visibility', 'update:contentType', 'update:tags'],
    template: '<div data-testid="editor-toolbar-stub"></div>',
  },
}));

vi.mock('@/components/editor/DraftStatus.vue', () => ({
  default: {
    name: 'DraftStatus',
    props: ['status', 'lastSavedAt'],
    template: '<span data-testid="draft-status-stub"></span>',
  },
}));

import PostEditor from '@/components/editor/PostEditor.vue';

describe('PostEditor', () => {
  const defaultProps = {
    modelValue: 'console.log("hello")',
    title: 'My Snippet',
    language: 'javascript',
    visibility: 'public' as const,
    contentType: 'snippet' as const,
    tags: ['vue'] as string[],
    saveStatus: 'saved' as const,
    lastSavedAt: null as Date | null,
  };

  let wrapper: ReturnType<typeof mount>;

  beforeEach(() => {
    wrapper = mount(PostEditor, { props: { ...defaultProps } });
  });

  describe('child component rendering', () => {
    it('should render CodeEditor component', () => {
      expect(wrapper.find('[data-testid="code-editor-stub"]').exists()).toBe(true);
    });

    it('should render EditorToolbar component', () => {
      expect(wrapper.find('[data-testid="editor-toolbar-stub"]').exists()).toBe(true);
    });

    it('should render DraftStatus component', () => {
      expect(wrapper.find('[data-testid="draft-status-stub"]').exists()).toBe(true);
    });

    it('should pass modelValue to CodeEditor', () => {
      const codeEditor = wrapper.findComponent({ name: 'CodeEditor' });
      expect(codeEditor.props('modelValue')).toBe('console.log("hello")');
    });

    it('should pass language to CodeEditor', () => {
      const codeEditor = wrapper.findComponent({ name: 'CodeEditor' });
      expect(codeEditor.props('language')).toBe('javascript');
    });

    it('should pass language to EditorToolbar', () => {
      const toolbar = wrapper.findComponent({ name: 'EditorToolbar' });
      expect(toolbar.props('language')).toBe('javascript');
    });

    it('should pass visibility to EditorToolbar', () => {
      const toolbar = wrapper.findComponent({ name: 'EditorToolbar' });
      expect(toolbar.props('visibility')).toBe('public');
    });

    it('should pass contentType to EditorToolbar', () => {
      const toolbar = wrapper.findComponent({ name: 'EditorToolbar' });
      expect(toolbar.props('contentType')).toBe('snippet');
    });

    it('should pass tags to EditorToolbar', () => {
      const toolbar = wrapper.findComponent({ name: 'EditorToolbar' });
      expect(toolbar.props('tags')).toEqual(['vue']);
    });

    it('should pass saveStatus to DraftStatus', () => {
      const draftStatus = wrapper.findComponent({ name: 'DraftStatus' });
      expect(draftStatus.props('status')).toBe('saved');
    });

    it('should pass lastSavedAt to DraftStatus', () => {
      const savedDate = new Date('2026-01-15T12:00:00Z');
      const w = mount(PostEditor, {
        props: { ...defaultProps, lastSavedAt: savedDate },
      });
      const draftStatus = w.findComponent({ name: 'DraftStatus' });
      expect(draftStatus.props('lastSavedAt')).toEqual(savedDate);
    });
  });

  describe('title input', () => {
    it('should render a title input', () => {
      const input = wrapper.find('[data-testid="title-input"]');
      expect(input.exists()).toBe(true);
    });

    it('should display the current title value', () => {
      const input = wrapper.find('[data-testid="title-input"]');
      expect((input.element as HTMLInputElement).value).toBe('My Snippet');
    });

    it('should emit update:title when title changes', async () => {
      const input = wrapper.find('[data-testid="title-input"]');
      await input.setValue('New Title');

      const emitted = wrapper.emitted('update:title');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual(['New Title']);
    });
  });

  describe('publish button', () => {
    it('should render a Publish Snippet button', () => {
      const button = wrapper.find('[data-testid="publish-button"]');
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe('Publish Snippet');
    });

    it('should emit publish when clicked', async () => {
      const button = wrapper.find('[data-testid="publish-button"]');
      await button.trigger('click');

      const emitted = wrapper.emitted('publish');
      expect(emitted).toBeTruthy();
      expect(emitted).toHaveLength(1);
    });
  });

  describe('event forwarding', () => {
    it('should forward update:modelValue from CodeEditor', async () => {
      const codeEditor = wrapper.findComponent({ name: 'CodeEditor' });
      await codeEditor.vm.$emit('update:modelValue', 'new code');

      const emitted = wrapper.emitted('update:modelValue');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual(['new code']);
    });

    it('should forward update:language from EditorToolbar', async () => {
      const toolbar = wrapper.findComponent({ name: 'EditorToolbar' });
      await toolbar.vm.$emit('update:language', 'python');

      const emitted = wrapper.emitted('update:language');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual(['python']);
    });

    it('should forward update:visibility from EditorToolbar', async () => {
      const toolbar = wrapper.findComponent({ name: 'EditorToolbar' });
      await toolbar.vm.$emit('update:visibility', 'private');

      const emitted = wrapper.emitted('update:visibility');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual(['private']);
    });

    it('should forward update:contentType from EditorToolbar', async () => {
      const toolbar = wrapper.findComponent({ name: 'EditorToolbar' });
      await toolbar.vm.$emit('update:contentType', 'prompt');

      const emitted = wrapper.emitted('update:contentType');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual(['prompt']);
    });

    it('should forward update:tags from EditorToolbar', async () => {
      const toolbar = wrapper.findComponent({ name: 'EditorToolbar' });
      await toolbar.vm.$emit('update:tags', ['vue', 'typescript']);

      const emitted = wrapper.emitted('update:tags');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual([['vue', 'typescript']]);
    });
  });
});
