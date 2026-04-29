import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick, shallowRef } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import type { PostFile } from '@forge/shared';

const fakeEditorView = {
  state: {
    doc: { toString: () => 'console.log("hello")' },
    selection: { main: { head: 5 } },
  },
  contentDOM: document.createElement('div'),
};

// Mock child components to avoid loading CodeMirror
vi.mock('@/components/editor/CodeEditor.vue', () => ({
  default: {
    name: 'CodeEditor',
    props: ['modelValue', 'language', 'readonly'],
    emits: ['update:modelValue'],
    template: '<div data-testid="code-editor-stub"></div>',
    setup(
      _props: Record<string, unknown>,
      { expose }: { expose: (exposed: Record<string, unknown>) => void },
    ) {
      const view = shallowRef(fakeEditorView);
      expose({ view });
      return {};
    },
  },
}));

const aiRequestCompletionMock = vi.fn();
vi.mock('@/components/editor/AiSuggestion.vue', () => ({
  default: {
    name: 'AiSuggestion',
    props: ['editorView'],
    template: '<span data-testid="ai-suggestion-stub"></span>',
    setup(
      _props: Record<string, unknown>,
      { expose }: { expose: (exposed: Record<string, unknown>) => void },
    ) {
      expose({ requestCompletion: aiRequestCompletionMock });
      return {};
    },
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

vi.mock('@/components/editor/AiGeneratePanel.vue', () => ({
  default: {
    name: 'AiGeneratePanel',
    props: ['editorView', 'contentType', 'language'],
    template: '<div data-testid="ai-generate-toggle" />',
  },
}));

vi.mock('@/components/post/FileSidebar.vue', () => ({
  default: {
    name: 'FileSidebar',
    props: ['files', 'activeFileId', 'editable'],
    emits: ['select'],
    template: '<div data-testid="file-sidebar-stub"><slot name="upload" /></div>',
  },
}));

vi.mock('@/components/post/FileUpload.vue', () => ({
  default: {
    name: 'FileUpload',
    emits: ['upload'],
    template: '<div data-testid="file-upload-stub"></div>',
  },
}));

import PostEditor from '@/components/editor/PostEditor.vue';
import { useFilesStore } from '@/stores/files';

/** Create a minimal DragEvent-compatible object with a files list, since jsdom lacks DataTransfer. */
function createDropEvent(files: File[]): { dataTransfer: { files: File[] } } {
  return {
    dataTransfer: { files },
  };
}

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
    setActivePinia(createPinia());
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
      const input = wrapper.find('[data-testid="new-post-title-input"]');
      expect(input.exists()).toBe(true);
    });

    it('should display the current title value', () => {
      const input = wrapper.find('[data-testid="new-post-title-input"]');
      expect((input.element as HTMLInputElement).value).toBe('My Snippet');
    });

    it('should emit update:title when title changes', async () => {
      const input = wrapper.find('[data-testid="new-post-title-input"]');
      await input.setValue('New Title');

      const emitted = wrapper.emitted('update:title');
      expect(emitted).toBeTruthy();
      expect((emitted as unknown[][])[0]).toEqual(['New Title']);
    });
  });

  describe('publish button', () => {
    it('should render a Publish Snippet button', () => {
      const button = wrapper.find('[data-testid="new-post-publish-btn"]');
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe('Publish Snippet');
    });

    it('should emit publish when clicked', async () => {
      const button = wrapper.find('[data-testid="new-post-publish-btn"]');
      await button.trigger('click');

      const emitted = wrapper.emitted('publish');
      expect(emitted).toBeTruthy();
      expect(emitted).toHaveLength(1);
    });
  });

  describe('save draft button', () => {
    it('should render a Save Draft button', () => {
      const button = wrapper.find('[data-testid="new-post-save-draft-btn"]');
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe('Save Draft');
    });

    it('should emit save-draft when clicked', async () => {
      const button = wrapper.find('[data-testid="new-post-save-draft-btn"]');
      await button.trigger('click');

      const emitted = wrapper.emitted('save-draft');
      expect(emitted).toBeTruthy();
      expect(emitted).toHaveLength(1);
    });
  });

  describe('markdown preview computed', () => {
    // The `markdownPreviewHtml` computed has an early-return when
    // `isMarkdownPreviewContentType` is false. The template gates the v-html
    // binding behind a v-if for the same flag, so the early-return branch is
    // never exercised through normal template flow. Read the computed
    // directly via the component's setup state to cover the false branch.
    it('returns an empty string when contentType is not "document"', async () => {
      const w = mount(PostEditor, { props: { ...defaultProps, contentType: 'snippet' as const } });
      await nextTick();

      const setupState = (w.vm as Record<string, unknown>).$.devtoolsRawSetupState as
        | Record<string, { value: string }>
        | undefined;
      const computedRef = setupState?.markdownPreviewHtml;
      expect(computedRef?.value).toBe('');
    });

    it('returns sanitized HTML when contentType is "document"', async () => {
      const w = mount(PostEditor, {
        props: { ...defaultProps, contentType: 'document' as const, modelValue: '# Heading' },
      });
      await nextTick();

      const setupState = (w.vm as Record<string, unknown>).$.devtoolsRawSetupState as
        | Record<string, { value: string }>
        | undefined;
      const computedRef = setupState?.markdownPreviewHtml;
      expect(computedRef?.value).toContain('<h1');
    });
  });

  describe('cancel button', () => {
    it('should render a Cancel button with the post-cancel-btn testid', () => {
      const button = wrapper.find('[data-testid="post-cancel-btn"]');
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe('Cancel');
    });

    it('should emit cancel when clicked', async () => {
      const button = wrapper.find('[data-testid="post-cancel-btn"]');
      await button.trigger('click');

      const emitted = wrapper.emitted('cancel');
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

  describe('AiGeneratePanel integration', () => {
    it('should render AiGeneratePanel when contentType is snippet', async () => {
      const w = mount(PostEditor, { props: { ...defaultProps, contentType: 'snippet' as const } });
      await nextTick();
      await flushPromises();

      expect(w.find('[data-testid="ai-generate-toggle"]').exists()).toBe(true);
    });

    it('should render AiGeneratePanel when contentType is prompt', async () => {
      const w = mount(PostEditor, { props: { ...defaultProps, contentType: 'prompt' as const } });
      await nextTick();
      await flushPromises();

      expect(w.find('[data-testid="ai-generate-toggle"]').exists()).toBe(true);
    });

    it('should render AiGeneratePanel when contentType is document', async () => {
      const w = mount(PostEditor, {
        props: { ...defaultProps, contentType: 'document' as const },
      });
      await nextTick();
      await flushPromises();

      expect(w.find('[data-testid="ai-generate-toggle"]').exists()).toBe(true);
    });

    it('should NOT render AiGeneratePanel when contentType is link', async () => {
      const w = mount(PostEditor, { props: { ...defaultProps, contentType: 'link' as const } });
      await nextTick();
      await flushPromises();

      expect(w.find('[data-testid="ai-generate-toggle"]').exists()).toBe(false);
    });

    it('should NOT render AiGeneratePanel when editorView is null', async () => {
      // Mount with a CodeEditor stub that exposes a null view
      const w = mount(PostEditor, {
        props: { ...defaultProps, contentType: 'snippet' as const },
        global: {
          stubs: {
            CodeEditor: {
              name: 'CodeEditor',
              props: ['modelValue', 'language', 'readonly'],
              emits: ['update:modelValue'],
              template: '<div data-testid="code-editor-stub"></div>',
              setup(
                _props: Record<string, unknown>,
                { expose }: { expose: (exposed: Record<string, unknown>) => void },
              ) {
                const view = shallowRef(null);
                expose({ view });
                return {};
              },
            },
          },
        },
      });
      await nextTick();
      await flushPromises();

      expect(w.find('[data-testid="ai-generate-toggle"]').exists()).toBe(false);
    });

    it('should pass correct props to AiGeneratePanel', async () => {
      const w = mount(PostEditor, { props: { ...defaultProps, contentType: 'snippet' as const } });
      await nextTick();
      await flushPromises();

      const panel = w.findComponent({ name: 'AiGeneratePanel' });
      expect(panel.exists()).toBe(true);
      expect(panel.props('contentType')).toBe('snippet');
      expect(panel.props('language')).toBe('javascript');
    });

    it('should still render title input, toolbar, CodeEditor, and publish button alongside AiGeneratePanel', async () => {
      const w = mount(PostEditor, { props: { ...defaultProps, contentType: 'snippet' as const } });
      await nextTick();
      await flushPromises();

      expect(w.find('[data-testid="new-post-title-input"]').exists()).toBe(true);
      expect(w.find('[data-testid="editor-toolbar-stub"]').exists()).toBe(true);
      expect(w.find('[data-testid="code-editor-stub"]').exists()).toBe(true);
      expect(w.find('[data-testid="new-post-publish-btn"]').exists()).toBe(true);
      expect(w.find('[data-testid="ai-generate-toggle"]').exists()).toBe(true);
    });
  });

  describe('AI suggestion integration', () => {
    it('should mount AiSuggestion when editorView is available', async () => {
      const w = mount(PostEditor, { props: { ...defaultProps } });
      await nextTick();
      await flushPromises();

      expect(w.find('[data-testid="ai-suggestion-stub"]').exists()).toBe(true);
    });

    it('should call AiSuggestion.requestCompletion when modelValue changes', async () => {
      aiRequestCompletionMock.mockClear();
      const w = mount(PostEditor, { props: { ...defaultProps } });
      await nextTick();
      await flushPromises();

      await w.setProps({ modelValue: 'const y = 10;' });
      await nextTick();
      await flushPromises();

      expect(aiRequestCompletionMock).toHaveBeenCalled();
      const call = aiRequestCompletionMock.mock.calls[0][0] as {
        before: string;
        after: string;
        language: string;
      };
      expect(call.language).toBe('javascript');
      expect(typeof call.before).toBe('string');
      expect(typeof call.after).toBe('string');
    });
  });

  describe('FileSidebar integration', () => {
    function createMockPostFile(overrides: Partial<PostFile> = {}): PostFile {
      return {
        id: 'file-1',
        postId: 'post-1',
        revisionId: null,
        filename: 'screenshot.png',
        mimeType: 'image/png',
        fileSize: 1024,
        sortOrder: 0,
        createdAt: new Date('2026-01-15T12:00:00Z'),
        ...overrides,
      };
    }

    it('should NOT render FileSidebar when no staged files exist', () => {
      const w = mount(PostEditor, { props: { ...defaultProps } });
      expect(w.find('[data-testid="file-sidebar-stub"]').exists()).toBe(false);
    });

    it('should render FileSidebar when stagedFiles exist', async () => {
      const filesStore = useFilesStore();
      filesStore.stagedFiles.push(createMockPostFile());

      const w = mount(PostEditor, { props: { ...defaultProps } });
      await nextTick();

      expect(w.find('[data-testid="file-sidebar-stub"]').exists()).toBe(true);
    });

    it('should render FileUpload inside FileSidebar upload slot', async () => {
      const filesStore = useFilesStore();
      filesStore.stagedFiles.push(createMockPostFile());

      const w = mount(PostEditor, { props: { ...defaultProps } });
      await nextTick();

      const sidebar = w.find('[data-testid="file-sidebar-stub"]');
      expect(sidebar.exists()).toBe(true);
      expect(sidebar.find('[data-testid="file-upload-stub"]').exists()).toBe(true);
    });

    it('should pass correct props to FileSidebar', async () => {
      const filesStore = useFilesStore();
      const mockFile = createMockPostFile();
      filesStore.stagedFiles.push(mockFile);
      filesStore.activeFileId = 'file-1';

      const w = mount(PostEditor, { props: { ...defaultProps } });
      await nextTick();

      const sidebar = w.findComponent({ name: 'FileSidebar' });
      expect(sidebar.exists()).toBe(true);
      expect(sidebar.props('files')).toEqual([mockFile]);
      expect(sidebar.props('activeFileId')).toBe('file-1');
      expect(sidebar.props('editable')).toBe(true);
    });

    it('should call filesStore.setActiveFile when sidebar emits select', async () => {
      const filesStore = useFilesStore();
      filesStore.stagedFiles.push(createMockPostFile());
      const setActiveSpy = vi.spyOn(filesStore, 'setActiveFile');

      const w = mount(PostEditor, { props: { ...defaultProps } });
      await nextTick();

      const sidebar = w.findComponent({ name: 'FileSidebar' });
      await sidebar.vm.$emit('select', 'file-2');

      expect(setActiveSpy).toHaveBeenCalledWith('file-2');
    });

    it('should hide FileSidebar when stagedFiles become empty', async () => {
      const filesStore = useFilesStore();
      filesStore.stagedFiles.push(createMockPostFile());

      const w = mount(PostEditor, { props: { ...defaultProps } });
      await nextTick();
      expect(w.find('[data-testid="file-sidebar-stub"]').exists()).toBe(true);

      filesStore.stagedFiles.splice(0);
      await nextTick();
      expect(w.find('[data-testid="file-sidebar-stub"]').exists()).toBe(false);
    });
  });

  describe('drop zone', () => {
    it('should have a drop zone wrapper element', () => {
      const dropZone = wrapper.find('[data-testid="editor-drop-zone"]');
      expect(dropZone.exists()).toBe(true);
    });

    it('should add visual ring on dragover', async () => {
      const dropZone = wrapper.find('[data-testid="editor-drop-zone"]');
      await dropZone.trigger('dragover');

      expect(dropZone.classes()).toContain('ring-2');
      expect(dropZone.classes()).toContain('ring-purple-500');
    });

    it('should remove visual ring on dragleave', async () => {
      const dropZone = wrapper.find('[data-testid="editor-drop-zone"]');
      await dropZone.trigger('dragover');
      expect(dropZone.classes()).toContain('ring-2');

      await dropZone.trigger('dragleave');
      expect(dropZone.classes()).not.toContain('ring-2');
    });

    it('should remove visual ring on drop', async () => {
      const dropZone = wrapper.find('[data-testid="editor-drop-zone"]');
      await dropZone.trigger('dragover');
      expect(dropZone.classes()).toContain('ring-2');

      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      await dropZone.trigger('drop', createDropEvent([mockFile]));
      expect(dropZone.classes()).not.toContain('ring-2');
    });

    it('should call filesStore.uploadFile when a file is dropped and postId is provided', async () => {
      const filesStore = useFilesStore();
      const uploadSpy = vi.spyOn(filesStore, 'uploadFile').mockResolvedValue(null);

      const w = mount(PostEditor, {
        props: { ...defaultProps, postId: 'post-123' },
      });
      await nextTick();
      await flushPromises();

      const dropZone = w.find('[data-testid="editor-drop-zone"]');
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      await dropZone.trigger('drop', createDropEvent([mockFile]));
      await flushPromises();

      expect(uploadSpy).toHaveBeenCalledWith('post-123', mockFile);
    });

    it('should NOT call filesStore.uploadFile on drop when postId is not provided', async () => {
      const filesStore = useFilesStore();
      const uploadSpy = vi.spyOn(filesStore, 'uploadFile').mockResolvedValue(null);

      const dropZone = wrapper.find('[data-testid="editor-drop-zone"]');
      const mockFile = new File(['test content'], 'test.txt', { type: 'text/plain' });
      await dropZone.trigger('drop', createDropEvent([mockFile]));
      await flushPromises();

      expect(uploadSpy).not.toHaveBeenCalled();
    });

    it('should call filesStore.uploadFile when FileUpload emits upload', async () => {
      const filesStore = useFilesStore();
      filesStore.stagedFiles.push({
        id: 'f1',
        postId: 'p1',
        revisionId: null,
        filename: 'a.ts',
        mimeType: 'text/plain',
        fileSize: 10,
        sortOrder: 0,
        createdAt: new Date(),
      } as PostFile);
      const uploadSpy = vi.spyOn(filesStore, 'uploadFile').mockResolvedValue(null);

      const w = mount(PostEditor, {
        props: { ...defaultProps, postId: 'post-123' },
      });
      await nextTick();
      await flushPromises();

      const fileUpload = w.findComponent({ name: 'FileUpload' });
      const mockFile = new File(['hello'], 'test.ts', { type: 'text/plain' });
      fileUpload.vm.$emit('upload', mockFile);
      await flushPromises();

      expect(uploadSpy).toHaveBeenCalledWith('post-123', mockFile);
    });

    it('should not upload via FileUpload when postId is missing', async () => {
      const filesStore = useFilesStore();
      filesStore.stagedFiles.push({
        id: 'f1',
        postId: 'p1',
        revisionId: null,
        filename: 'a.ts',
        mimeType: 'text/plain',
        fileSize: 10,
        sortOrder: 0,
        createdAt: new Date(),
      } as PostFile);
      const uploadSpy = vi.spyOn(filesStore, 'uploadFile').mockResolvedValue(null);

      const w = mount(PostEditor, {
        props: { ...defaultProps },
      });
      await nextTick();
      await flushPromises();

      const fileUpload = w.findComponent({ name: 'FileUpload' });
      const mockFile = new File(['hello'], 'test.ts', { type: 'text/plain' });
      fileUpload.vm.$emit('upload', mockFile);
      await flushPromises();

      expect(uploadSpy).not.toHaveBeenCalled();
    });

    it('should upload multiple files when multiple are dropped', async () => {
      const filesStore = useFilesStore();
      const uploadSpy = vi.spyOn(filesStore, 'uploadFile').mockResolvedValue(null);

      const w = mount(PostEditor, {
        props: { ...defaultProps, postId: 'post-123' },
      });
      await nextTick();
      await flushPromises();

      const dropZone = w.find('[data-testid="editor-drop-zone"]');
      const mockFile1 = new File(['content1'], 'file1.txt', { type: 'text/plain' });
      const mockFile2 = new File(['content2'], 'file2.txt', { type: 'text/plain' });
      await dropZone.trigger('drop', createDropEvent([mockFile1, mockFile2]));
      await flushPromises();

      expect(uploadSpy).toHaveBeenCalledTimes(2);
      expect(uploadSpy).toHaveBeenCalledWith('post-123', mockFile1);
      expect(uploadSpy).toHaveBeenCalledWith('post-123', mockFile2);
    });
  });

  describe('local file input (file-upload-input)', () => {
    function setInputFiles(input: HTMLInputElement, files: File[]): void {
      Object.defineProperty(input, 'files', {
        value: {
          length: files.length,
          item: (i: number) => files[i] ?? null,
          [Symbol.iterator]: function* () {
            for (const f of files) yield f;
          },
        },
        configurable: true,
      });
    }

    it('returns early when no files are selected', async () => {
      const filesStore = useFilesStore();
      const uploadSpy = vi.spyOn(filesStore, 'uploadFile').mockResolvedValue(null);

      const w = mount(PostEditor, { props: { ...defaultProps, postId: 'post-123' } });
      await flushPromises();

      const input = w.find('[data-testid="file-upload-input"]').element as HTMLInputElement;
      setInputFiles(input, []);
      await w.find('[data-testid="file-upload-input"]').trigger('change');

      expect(uploadSpy).not.toHaveBeenCalled();
    });

    it('uploads via filesStore when postId is provided', async () => {
      const filesStore = useFilesStore();
      const uploadSpy = vi.spyOn(filesStore, 'uploadFile').mockResolvedValue(null);

      const w = mount(PostEditor, { props: { ...defaultProps, postId: 'post-123' } });
      await flushPromises();

      const file = new File(['hi'], 'note.txt', { type: 'text/plain' });
      const input = w.find('[data-testid="file-upload-input"]').element as HTMLInputElement;
      setInputFiles(input, [file]);
      await w.find('[data-testid="file-upload-input"]').trigger('change');

      expect(uploadSpy).toHaveBeenCalledWith('post-123', file);
    });

    it('stages locally when postId is missing (new-post flow)', async () => {
      const filesStore = useFilesStore();
      const uploadSpy = vi.spyOn(filesStore, 'uploadFile').mockResolvedValue(null);

      const w = mount(PostEditor, { props: { ...defaultProps } }); // no postId
      await flushPromises();

      const file = new File(['hi'], 'staged.txt', { type: 'text/plain' });
      const input = w.find('[data-testid="file-upload-input"]').element as HTMLInputElement;
      setInputFiles(input, [file]);
      await w.find('[data-testid="file-upload-input"]').trigger('change');

      expect(uploadSpy).not.toHaveBeenCalled();
      expect(w.find('[data-testid="file-upload-preview"]').exists()).toBe(true);
    });
  });
});
