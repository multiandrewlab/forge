import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { ref } from 'vue';
import type { PostFile } from '@forge/shared';
import CodeRunner from '../../../components/post/CodeRunner.vue';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockRun = vi.fn();
const mockAbort = vi.fn();
const mockClear = vi.fn();

vi.mock('../../../composables/useCodeRunner.js', () => ({
  useCodeRunner: vi.fn(() => ({
    output: ref([]),
    status: ref('idle'),
    executionTime: ref(null),
    exitCode: ref(null),
    truncated: ref(false),
    run: mockRun,
    abort: mockAbort,
    clear: mockClear,
  })),
}));

vi.mock('../../../lib/api.js', () => ({
  apiFetch: vi.fn(),
}));

// Import apiFetch after mock setup so we get the mocked version
import { apiFetch } from '../../../lib/api.js';
const mockApiFetch = apiFetch as unknown as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  postId: 'post-1',
  revisionId: 'rev-1',
  language: 'python' as string | null,
};

function makeFile(overrides: Partial<PostFile> = {}): PostFile {
  return {
    id: 'file-1',
    postId: 'post-1',
    revisionId: 'rev-1',
    filename: 'main.py',
    mimeType: 'text/x-python',
    fileSize: 100,
    sortOrder: 0,
    createdAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CodeRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Rendering conditions
  // -------------------------------------------------------------------------

  describe('rendering conditions', () => {
    it('does not render when language is null', () => {
      const wrapper = mount(CodeRunner, {
        props: { ...defaultProps, language: null },
      });

      expect(wrapper.find('[data-testid="code-runner"]').exists()).toBe(false);
    });

    it('does not render when language is unrecognized', () => {
      const wrapper = mount(CodeRunner, {
        props: { ...defaultProps, language: 'brainfuck' },
      });

      expect(wrapper.find('[data-testid="code-runner"]').exists()).toBe(false);
    });

    it('renders with disabled RunButton for recognized but unsupported language', () => {
      const wrapper = mount(CodeRunner, {
        props: { ...defaultProps, language: 'go' },
      });

      expect(wrapper.find('[data-testid="code-runner"]').exists()).toBe(true);
      const runButton = wrapper.findComponent({ name: 'RunButton' });
      expect(runButton.exists()).toBe(true);
      expect(runButton.props('disabled')).toBe(true);
      expect(runButton.props('disabledReason')).toBe('Run not available for go');
    });

    it('renders with active RunButton for supported language', () => {
      const wrapper = mount(CodeRunner, {
        props: { ...defaultProps, language: 'python' },
      });

      expect(wrapper.find('[data-testid="code-runner"]').exists()).toBe(true);
      const runButton = wrapper.findComponent({ name: 'RunButton' });
      expect(runButton.exists()).toBe(true);
      expect(runButton.props('disabled')).toBeFalsy();
    });

    it('renders with active RunButton for javascript', () => {
      const wrapper = mount(CodeRunner, {
        props: { ...defaultProps, language: 'javascript' },
      });

      expect(wrapper.find('[data-testid="code-runner"]').exists()).toBe(true);
      const runButton = wrapper.findComponent({ name: 'RunButton' });
      expect(runButton.exists()).toBe(true);
      expect(runButton.props('disabled')).toBeFalsy();
    });

    it('renders with active RunButton for typescript', () => {
      const wrapper = mount(CodeRunner, {
        props: { ...defaultProps, language: 'typescript' },
      });

      expect(wrapper.find('[data-testid="code-runner"]').exists()).toBe(true);
      const runButton = wrapper.findComponent({ name: 'RunButton' });
      expect(runButton.exists()).toBe(true);
      expect(runButton.props('disabled')).toBeFalsy();
    });

    it('renders disabled RunButton for rust', () => {
      const wrapper = mount(CodeRunner, {
        props: { ...defaultProps, language: 'rust' },
      });

      expect(wrapper.find('[data-testid="code-runner"]').exists()).toBe(true);
      const runButton = wrapper.findComponent({ name: 'RunButton' });
      expect(runButton.props('disabled')).toBe(true);
      expect(runButton.props('disabledReason')).toBe('Run not available for rust');
    });

    it('renders disabled RunButton for java', () => {
      const wrapper = mount(CodeRunner, {
        props: { ...defaultProps, language: 'java' },
      });

      expect(wrapper.find('[data-testid="code-runner"]').exists()).toBe(true);
      const runButton = wrapper.findComponent({ name: 'RunButton' });
      expect(runButton.props('disabled')).toBe(true);
      expect(runButton.props('disabledReason')).toBe('Run not available for java');
    });
  });

  // -------------------------------------------------------------------------
  // Single-file mode
  // -------------------------------------------------------------------------

  describe('single-file mode', () => {
    it('calls run with singleFileContent wrapped as file array', async () => {
      const wrapper = mount(CodeRunner, {
        props: {
          ...defaultProps,
          language: 'python',
          singleFileContent: 'print("hello")',
        },
      });

      const runButton = wrapper.findComponent({ name: 'RunButton' });
      await runButton.vm.$emit('run');
      await flushPromises();

      expect(mockRun).toHaveBeenCalledOnce();
      expect(mockRun).toHaveBeenCalledWith({ language: 'python', files: [{ filename: 'main.py', content: 'print("hello")' }], entryFile: 'main.py' });
    });

    it('uses correct extension for javascript', async () => {
      const wrapper = mount(CodeRunner, {
        props: {
          ...defaultProps,
          language: 'javascript',
          singleFileContent: 'console.log("hi")',
        },
      });

      const runButton = wrapper.findComponent({ name: 'RunButton' });
      await runButton.vm.$emit('run');
      await flushPromises();

      expect(mockRun).toHaveBeenCalledWith({ language: 'javascript', files: [{ filename: 'main.js', content: 'console.log("hi")' }], entryFile: 'main.js' });
    });

    it('uses correct extension for typescript', async () => {
      const wrapper = mount(CodeRunner, {
        props: {
          ...defaultProps,
          language: 'typescript',
          singleFileContent: 'const x: number = 1',
        },
      });

      const runButton = wrapper.findComponent({ name: 'RunButton' });
      await runButton.vm.$emit('run');
      await flushPromises();

      expect(mockRun).toHaveBeenCalledWith({ language: 'typescript', files: [{ filename: 'main.ts', content: 'const x: number = 1' }], entryFile: 'main.ts' });
    });

    it('defaults to empty string when singleFileContent is undefined', async () => {
      const wrapper = mount(CodeRunner, {
        props: {
          ...defaultProps,
          language: 'python',
        },
      });

      const runButton = wrapper.findComponent({ name: 'RunButton' });
      await runButton.vm.$emit('run');
      await flushPromises();

      expect(mockRun).toHaveBeenCalledWith({ language: 'python', files: [{ filename: 'main.py', content: '' }], entryFile: 'main.py' });
    });
  });

  // -------------------------------------------------------------------------
  // Multi-file mode
  // -------------------------------------------------------------------------

  describe('multi-file mode', () => {
    it('fetches content for each text file and calls run', async () => {
      const files: PostFile[] = [
        makeFile({ id: 'f1', filename: 'main.py', mimeType: 'text/x-python' }),
        makeFile({ id: 'f2', filename: 'utils.py', mimeType: 'text/x-python' }),
      ];

      mockApiFetch.mockImplementation((url: string) => {
        if (url.includes('f1')) return Promise.resolve({ text: () => Promise.resolve('code1') });
        if (url.includes('f2')) return Promise.resolve({ text: () => Promise.resolve('code2') });
        return Promise.resolve({ text: () => Promise.resolve('') });
      });

      const wrapper = mount(CodeRunner, {
        props: {
          ...defaultProps,
          language: 'python',
          files,
        },
      });

      const runButton = wrapper.findComponent({ name: 'RunButton' });
      await runButton.vm.$emit('run');
      await flushPromises();

      expect(mockApiFetch).toHaveBeenCalledTimes(2);
      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1/files/f1');
      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1/files/f2');

      expect(mockRun).toHaveBeenCalledOnce();
      expect(mockRun).toHaveBeenCalledWith({
        language: 'python',
        files: [
          { filename: 'main.py', content: 'code1' },
          { filename: 'utils.py', content: 'code2' },
        ],
        entryFile: 'main.py',
      });
    });

    it('skips binary files by mimeType', async () => {
      const files: PostFile[] = [
        makeFile({ id: 'f1', filename: 'main.py', mimeType: 'text/x-python' }),
        makeFile({ id: 'f2', filename: 'image.png', mimeType: 'image/png' }),
      ];

      mockApiFetch.mockResolvedValue({ text: () => Promise.resolve('code1') });

      const wrapper = mount(CodeRunner, {
        props: {
          ...defaultProps,
          language: 'python',
          files,
        },
      });

      const runButton = wrapper.findComponent({ name: 'RunButton' });
      await runButton.vm.$emit('run');
      await flushPromises();

      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1/files/f1');

      expect(mockRun).toHaveBeenCalledWith({ language: 'python', files: [{ filename: 'main.py', content: 'code1' }], entryFile: 'main.py' });
    });

    it('treats null mimeType as text (fetches the file)', async () => {
      const files: PostFile[] = [
        makeFile({ id: 'f1', filename: 'script.py', mimeType: null }),
      ];

      mockApiFetch.mockResolvedValue({ text: () => Promise.resolve('null-mime') });

      const wrapper = mount(CodeRunner, {
        props: {
          ...defaultProps,
          language: 'python',
          files,
        },
      });

      const runButton = wrapper.findComponent({ name: 'RunButton' });
      await runButton.vm.$emit('run');
      await flushPromises();

      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      expect(mockRun).toHaveBeenCalledWith({ language: 'python', files: [{ filename: 'script.py', content: 'null-mime' }], entryFile: 'script.py' });
    });

    it('treats application/json as text', async () => {
      const files: PostFile[] = [
        makeFile({ id: 'f1', filename: 'data.json', mimeType: 'application/json' }),
      ];

      mockApiFetch.mockResolvedValue({ text: () => Promise.resolve('{"a":1}') });

      const wrapper = mount(CodeRunner, {
        props: {
          ...defaultProps,
          language: 'javascript',
          files,
        },
      });

      const runButton = wrapper.findComponent({ name: 'RunButton' });
      await runButton.vm.$emit('run');
      await flushPromises();

      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      expect(mockRun).toHaveBeenCalledWith({ language: 'javascript', files: [{ filename: 'data.json', content: '{"a":1}' }], entryFile: 'data.json' });
    });

    it('treats application/javascript as text', async () => {
      const files: PostFile[] = [
        makeFile({ id: 'f1', filename: 'lib.js', mimeType: 'application/javascript' }),
      ];

      mockApiFetch.mockResolvedValue({ text: () => Promise.resolve('var x = 1;') });

      const wrapper = mount(CodeRunner, {
        props: {
          ...defaultProps,
          language: 'javascript',
          files,
        },
      });

      const runButton = wrapper.findComponent({ name: 'RunButton' });
      await runButton.vm.$emit('run');
      await flushPromises();

      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      expect(mockRun).toHaveBeenCalledWith({ language: 'javascript', files: [{ filename: 'lib.js', content: 'var x = 1;' }], entryFile: 'lib.js' });
    });

    it('uses Promise.all for parallel fetches', async () => {
      const files: PostFile[] = [
        makeFile({ id: 'f1', filename: 'a.py', mimeType: 'text/x-python' }),
        makeFile({ id: 'f2', filename: 'b.py', mimeType: 'text/x-python' }),
        makeFile({ id: 'f3', filename: 'c.py', mimeType: 'text/x-python' }),
      ];

      // Track call order to verify parallel execution
      const resolvers: Array<(v: string) => void> = [];
      mockApiFetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolvers.push((content: string) =>
              resolve({ text: () => Promise.resolve(content) }),
            );
          }),
      );

      const wrapper = mount(CodeRunner, {
        props: {
          ...defaultProps,
          language: 'python',
          files,
        },
      });

      const runButton = wrapper.findComponent({ name: 'RunButton' });
      await runButton.vm.$emit('run');

      // All three fetch calls should be initiated before any resolve
      await vi.waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledTimes(3);
      });

      // Resolve all in order
      resolvers[0]('code-a');
      resolvers[1]('code-b');
      resolvers[2]('code-c');
      await flushPromises();

      expect(mockRun).toHaveBeenCalledWith({
        language: 'python',
        files: [
          { filename: 'a.py', content: 'code-a' },
          { filename: 'b.py', content: 'code-b' },
          { filename: 'c.py', content: 'code-c' },
        ],
        entryFile: 'a.py',
      });
    });

    it('handles fetch error gracefully', async () => {
      const files: PostFile[] = [
        makeFile({ id: 'f1', filename: 'main.py', mimeType: 'text/x-python' }),
      ];

      mockApiFetch.mockRejectedValue(new Error('Network error'));

      const wrapper = mount(CodeRunner, {
        props: {
          ...defaultProps,
          language: 'python',
          files,
        },
      });

      const runButton = wrapper.findComponent({ name: 'RunButton' });
      await runButton.vm.$emit('run');
      await flushPromises();

      // Should not call run on error
      expect(mockRun).not.toHaveBeenCalled();
    });

    it('prefers multi-file mode when files array is provided', async () => {
      const files: PostFile[] = [
        makeFile({ id: 'f1', filename: 'main.py', mimeType: 'text/x-python' }),
      ];

      mockApiFetch.mockResolvedValue({ text: () => Promise.resolve('file-content') });

      const wrapper = mount(CodeRunner, {
        props: {
          ...defaultProps,
          language: 'python',
          singleFileContent: 'single-content',
          files,
        },
      });

      const runButton = wrapper.findComponent({ name: 'RunButton' });
      await runButton.vm.$emit('run');
      await flushPromises();

      // Should use multi-file, not single-file
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      expect(mockRun).toHaveBeenCalledWith({ language: 'python', files: [{ filename: 'main.py', content: 'file-content' }], entryFile: 'main.py' });
    });
  });

  // -------------------------------------------------------------------------
  // Abort delegation
  // -------------------------------------------------------------------------

  describe('abort delegation', () => {
    it('delegates abort to composable', async () => {
      const wrapper = mount(CodeRunner, {
        props: { ...defaultProps, language: 'python' },
      });

      const runButton = wrapper.findComponent({ name: 'RunButton' });
      await runButton.vm.$emit('abort');

      expect(mockAbort).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Clear delegation
  // -------------------------------------------------------------------------

  describe('clear delegation', () => {
    it('delegates clear to composable via ExecutionOutput', async () => {
      const wrapper = mount(CodeRunner, {
        props: { ...defaultProps, language: 'python' },
      });

      const executionOutput = wrapper.findComponent({ name: 'ExecutionOutput' });
      expect(executionOutput.exists()).toBe(true);
      await executionOutput.vm.$emit('clear');

      expect(mockClear).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // ExecutionOutput visibility
  // -------------------------------------------------------------------------

  describe('ExecutionOutput integration', () => {
    it('does not render ExecutionOutput for unsupported language', () => {
      const wrapper = mount(CodeRunner, {
        props: { ...defaultProps, language: 'go' },
      });

      const executionOutput = wrapper.findComponent({ name: 'ExecutionOutput' });
      expect(executionOutput.exists()).toBe(false);
    });

    it('renders ExecutionOutput for supported language', () => {
      const wrapper = mount(CodeRunner, {
        props: { ...defaultProps, language: 'python' },
      });

      const executionOutput = wrapper.findComponent({ name: 'ExecutionOutput' });
      expect(executionOutput.exists()).toBe(true);
    });
  });
});
