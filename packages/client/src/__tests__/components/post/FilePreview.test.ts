import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import type { PostFile } from '@forge/shared';

// vi.hoisted runs before vi.mock hoisting
const { mockApiFetch, mockCodeToHtml, mockMarkedParse, mockDOMPurifySanitize } = vi.hoisted(() => ({
  mockApiFetch: vi.fn(),
  mockCodeToHtml: vi.fn(),
  mockMarkedParse: vi.fn(),
  mockDOMPurifySanitize: vi.fn(),
}));

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

vi.mock('shiki', () => ({
  codeToHtml: (...args: unknown[]) => mockCodeToHtml(...args),
}));

vi.mock('marked', () => ({
  marked: { parse: (...args: unknown[]) => mockMarkedParse(...args) },
}));

vi.mock('dompurify', () => ({
  default: { sanitize: (...args: unknown[]) => mockDOMPurifySanitize(...args) },
}));

import FilePreview from '@/components/post/FilePreview.vue';

function makeFile(overrides: Partial<PostFile> = {}): PostFile {
  return {
    id: 'f1',
    postId: 'p1',
    revisionId: null,
    filename: 'main.ts',
    mimeType: 'text/typescript',
    fileSize: 100,
    sortOrder: 0,
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

function mockFetchResponse(body: string, ok = true): Response {
  return {
    ok,
    status: ok ? 200 : 500,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body)),
    headers: new Headers({ 'content-type': 'text/plain' }),
    blob: () => Promise.resolve(new Blob([body])),
  } as Response;
}

describe('FilePreview', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockCodeToHtml.mockReset();
    mockMarkedParse.mockReset();
    mockDOMPurifySanitize.mockReset();

    // Default: successful text fetch
    mockApiFetch.mockResolvedValue(mockFetchResponse('file content'));
    mockCodeToHtml.mockResolvedValue('<pre><code>highlighted</code></pre>');
    mockMarkedParse.mockReturnValue('<p>rendered markdown</p>');
    mockDOMPurifySanitize.mockImplementation((html: string) => html);
  });

  it('shows loading state while fetching', () => {
    // Make fetch hang
    mockApiFetch.mockReturnValue(new Promise(() => {}));

    const wrapper = mount(FilePreview, {
      props: { file: makeFile(), postId: 'p1' },
    });

    expect(wrapper.text()).toContain('Loading');
  });

  it('fetches content from correct URL on mount', async () => {
    const file = makeFile({ id: 'f42', postId: 'p7' });
    mount(FilePreview, {
      props: { file, postId: 'p7' },
    });
    await flushPromises();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p7/files/f42');
  });

  it('shows error state on fetch failure', async () => {
    mockApiFetch.mockResolvedValue(mockFetchResponse('', false));

    const wrapper = mount(FilePreview, {
      props: { file: makeFile(), postId: 'p1' },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Failed to load file');
  });

  it('shows error state on network error', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network error'));

    const wrapper = mount(FilePreview, {
      props: { file: makeFile(), postId: 'p1' },
    });
    await flushPromises();

    expect(wrapper.text()).toContain('Failed to load file');
  });

  describe('code files (.ts, .js, .py, etc.)', () => {
    const codeExtensions = [
      { ext: 'ts', lang: 'typescript' },
      { ext: 'js', lang: 'javascript' },
      { ext: 'py', lang: 'python' },
      { ext: 'go', lang: 'go' },
      { ext: 'rs', lang: 'rust' },
      { ext: 'java', lang: 'java' },
      { ext: 'cpp', lang: 'cpp' },
      { ext: 'c', lang: 'c' },
      { ext: 'rb', lang: 'ruby' },
      { ext: 'php', lang: 'php' },
      { ext: 'html', lang: 'html' },
      { ext: 'css', lang: 'css' },
      { ext: 'sql', lang: 'sql' },
      { ext: 'sh', lang: 'bash' },
      { ext: 'bash', lang: 'bash' },
      { ext: 'yml', lang: 'yaml' },
      { ext: 'yaml', lang: 'yaml' },
    ];

    it.each(codeExtensions)(
      'renders .$ext files with Shiki syntax highlighting (lang=$lang)',
      async ({ ext, lang }) => {
        const file = makeFile({ filename: `code.${ext}` });
        mockApiFetch.mockResolvedValue(mockFetchResponse(`// ${ext} code`));
        mockCodeToHtml.mockResolvedValue(
          `<pre><code class="lang-${lang}">highlighted</code></pre>`,
        );

        const wrapper = mount(FilePreview, {
          props: { file, postId: 'p1' },
        });
        await flushPromises();

        expect(mockCodeToHtml).toHaveBeenCalledWith(`// ${ext} code`, {
          lang,
          theme: 'one-dark-pro',
        });
        expect(wrapper.html()).toContain('highlighted');
      },
    );

    it('falls back to "text" when Shiki throws for unknown language', async () => {
      const file = makeFile({ filename: 'code.ts' });
      mockApiFetch.mockResolvedValue(mockFetchResponse('ts code'));

      let callCount = 0;
      mockCodeToHtml.mockImplementation(async (code: string, opts: { lang: string }) => {
        callCount++;
        if (callCount === 1) throw new Error('Unknown lang');
        return `<pre><code class="lang-${opts.lang}">${code}</code></pre>`;
      });

      const wrapper = mount(FilePreview, {
        props: { file, postId: 'p1' },
      });
      await flushPromises();

      expect(mockCodeToHtml).toHaveBeenCalledTimes(2);
      expect(mockCodeToHtml).toHaveBeenNthCalledWith(2, 'ts code', {
        lang: 'text',
        theme: 'one-dark-pro',
      });
      expect(wrapper.html()).toContain('ts code');
    });
  });

  describe('markdown files (.md)', () => {
    it('renders markdown with marked + DOMPurify', async () => {
      const file = makeFile({ filename: 'README.md' });
      mockApiFetch.mockResolvedValue(mockFetchResponse('# Hello'));
      mockMarkedParse.mockReturnValue('<h1>Hello</h1>');
      mockDOMPurifySanitize.mockReturnValue('<h1>Hello</h1>');

      const wrapper = mount(FilePreview, {
        props: { file, postId: 'p1' },
      });
      await flushPromises();

      expect(mockMarkedParse).toHaveBeenCalledWith('# Hello');
      expect(mockDOMPurifySanitize).toHaveBeenCalledWith('<h1>Hello</h1>');
      expect(wrapper.html()).toContain('Hello');
    });
  });

  describe('JSON files (.json)', () => {
    it('formats and highlights JSON', async () => {
      const file = makeFile({ filename: 'config.json' });
      const rawJson = '{"key":"value"}';
      const formattedJson = JSON.stringify({ key: 'value' }, null, 2);
      mockApiFetch.mockResolvedValue(mockFetchResponse(rawJson));
      mockCodeToHtml.mockResolvedValue('<pre><code>formatted json</code></pre>');

      const wrapper = mount(FilePreview, {
        props: { file, postId: 'p1' },
      });
      await flushPromises();

      expect(mockCodeToHtml).toHaveBeenCalledWith(formattedJson, {
        lang: 'json',
        theme: 'one-dark-pro',
      });
      expect(wrapper.html()).toContain('formatted json');
    });

    it('falls back to plain text if JSON is invalid', async () => {
      const file = makeFile({ filename: 'bad.json' });
      mockApiFetch.mockResolvedValue(mockFetchResponse('not valid json {'));

      const wrapper = mount(FilePreview, {
        props: { file, postId: 'p1' },
      });
      await flushPromises();

      // Should still render the raw content as plain text
      expect(wrapper.text()).toContain('not valid json {');
    });
  });

  describe('image files', () => {
    it('renders an <img> tag for image MIME types', async () => {
      const file = makeFile({ filename: 'photo.png', mimeType: 'image/png' });
      const blobData = new Blob(['fake-image'], { type: 'image/png' });
      mockApiFetch.mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(blobData),
        headers: new Headers({ 'content-type': 'image/png' }),
      } as Response);

      // Mock URL.createObjectURL
      const mockUrl = 'blob:http://localhost/fake-image-url';
      const createObjectURLSpy = vi.fn().mockReturnValue(mockUrl);
      const revokeObjectURLSpy = vi.fn();
      globalThis.URL.createObjectURL = createObjectURLSpy;
      globalThis.URL.revokeObjectURL = revokeObjectURLSpy;

      const wrapper = mount(FilePreview, {
        props: { file, postId: 'p1' },
      });
      await flushPromises();

      const img = wrapper.find('img');
      expect(img.exists()).toBe(true);
      expect(img.attributes('src')).toBe(mockUrl);
    });

    it('renders img with max-width constraint', async () => {
      const file = makeFile({ filename: 'photo.jpg', mimeType: 'image/jpeg' });
      const blobData = new Blob(['fake-image'], { type: 'image/jpeg' });
      mockApiFetch.mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(blobData),
        headers: new Headers({ 'content-type': 'image/jpeg' }),
      } as Response);

      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:fake');
      globalThis.URL.revokeObjectURL = vi.fn();

      const wrapper = mount(FilePreview, {
        props: { file, postId: 'p1' },
      });
      await flushPromises();

      const img = wrapper.find('img');
      expect(img.exists()).toBe(true);
      expect(img.classes()).toContain('max-w-full');
    });
  });

  describe('other text files', () => {
    it('renders unknown extensions as monospace plain text', async () => {
      const file = makeFile({ filename: 'data.txt', mimeType: 'text/plain' });
      mockApiFetch.mockResolvedValue(mockFetchResponse('plain text content'));

      const wrapper = mount(FilePreview, {
        props: { file, postId: 'p1' },
      });
      await flushPromises();

      const pre = wrapper.find('pre');
      expect(pre.exists()).toBe(true);
      expect(pre.text()).toContain('plain text content');
    });

    it('renders files with no extension as plain text', async () => {
      const file = makeFile({ filename: 'Makefile', mimeType: null });
      mockApiFetch.mockResolvedValue(mockFetchResponse('all: build'));

      const wrapper = mount(FilePreview, {
        props: { file, postId: 'p1' },
      });
      await flushPromises();

      const pre = wrapper.find('pre');
      expect(pre.exists()).toBe(true);
      expect(pre.text()).toContain('all: build');
    });
  });

  it('re-fetches content when file prop changes', async () => {
    const file1 = makeFile({ id: 'f1', filename: 'a.ts' });
    const file2 = makeFile({ id: 'f2', filename: 'b.ts' });

    mockApiFetch.mockResolvedValue(mockFetchResponse('content-a'));

    const wrapper = mount(FilePreview, {
      props: { file: file1, postId: 'p1' },
    });
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/files/f1');

    mockApiFetch.mockResolvedValue(mockFetchResponse('content-b'));
    await wrapper.setProps({ file: file2 });
    await flushPromises();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/files/f2');
  });

  it('cleans up previous image URL when file changes to another image', async () => {
    const file1 = makeFile({ id: 'img1', filename: 'a.png', mimeType: 'image/png' });
    const file2 = makeFile({ id: 'img2', filename: 'b.png', mimeType: 'image/png' });

    const blob1 = new Blob(['img1'], { type: 'image/png' });
    const blob2 = new Blob(['img2'], { type: 'image/png' });

    const url1 = 'blob:http://localhost/url1';
    const url2 = 'blob:http://localhost/url2';
    const createSpy = vi.fn().mockReturnValueOnce(url1).mockReturnValueOnce(url2);
    const revokeSpy = vi.fn();
    globalThis.URL.createObjectURL = createSpy;
    globalThis.URL.revokeObjectURL = revokeSpy;

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(blob1),
      headers: new Headers({ 'content-type': 'image/png' }),
    } as Response);

    const wrapper = mount(FilePreview, {
      props: { file: file1, postId: 'p1' },
    });
    await flushPromises();

    // First image URL created
    expect(createSpy).toHaveBeenCalledTimes(1);

    mockApiFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(blob2),
      headers: new Headers({ 'content-type': 'image/png' }),
    } as Response);

    await wrapper.setProps({ file: file2 });
    await flushPromises();

    // Previous URL should be revoked before creating the new one
    expect(revokeSpy).toHaveBeenCalledWith(url1);
    expect(createSpy).toHaveBeenCalledTimes(2);
  });

  it('cleans up object URL for images on unmount', async () => {
    const file = makeFile({ filename: 'img.png', mimeType: 'image/png' });
    const blobData = new Blob(['fake'], { type: 'image/png' });
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.resolve(blobData),
      headers: new Headers({ 'content-type': 'image/png' }),
    } as Response);

    const mockUrl = 'blob:http://localhost/cleanup-test';
    globalThis.URL.createObjectURL = vi.fn().mockReturnValue(mockUrl);
    const revokeSpy = vi.fn();
    globalThis.URL.revokeObjectURL = revokeSpy;

    const wrapper = mount(FilePreview, {
      props: { file, postId: 'p1' },
    });
    await flushPromises();

    wrapper.unmount();
    expect(revokeSpy).toHaveBeenCalledWith(mockUrl);
  });

  describe('testid surfaces', () => {
    it('renders the code variant with file-preview-code testid for .json', async () => {
      const file = makeFile({
        filename: 'a.json',
        mimeType: 'application/json',
        fileSize: 17,
      });
      mockApiFetch.mockResolvedValue(mockFetchResponse('{"hello":"world"}'));
      mockCodeToHtml.mockResolvedValue('<pre><code>{"hello":"world"}</code></pre>');

      const wrapper = mount(FilePreview, {
        props: { file, postId: 'p1' },
      });
      await flushPromises();

      expect(wrapper.find('[data-testid="file-preview-code"]').exists()).toBe(true);
    });

    it('renders the image variant with file-preview-image testid', async () => {
      const file = makeFile({ filename: 'photo.png', mimeType: 'image/png' });
      const blobData = new Blob(['fake-image'], { type: 'image/png' });
      mockApiFetch.mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(blobData),
        headers: new Headers({ 'content-type': 'image/png' }),
      } as Response);
      globalThis.URL.createObjectURL = vi.fn().mockReturnValue('blob:fake');
      globalThis.URL.revokeObjectURL = vi.fn();

      const wrapper = mount(FilePreview, {
        props: { file, postId: 'p1' },
      });
      await flushPromises();

      expect(wrapper.find('[data-testid="file-preview-image"]').exists()).toBe(true);
    });

    it('renders the markdown variant with file-preview-markdown testid', async () => {
      const file = makeFile({ filename: 'README.md' });
      mockApiFetch.mockResolvedValue(mockFetchResponse('# Hello'));
      mockMarkedParse.mockReturnValue('<h1>Hello</h1>');
      mockDOMPurifySanitize.mockReturnValue('<h1>Hello</h1>');

      const wrapper = mount(FilePreview, {
        props: { file, postId: 'p1' },
      });
      await flushPromises();

      expect(wrapper.find('[data-testid="file-preview-markdown"]').exists()).toBe(true);
    });

    it('renders the plain-text fallback variant with file-preview-text testid', async () => {
      const file = makeFile({ filename: 'data.txt', mimeType: 'text/plain' });
      mockApiFetch.mockResolvedValue(mockFetchResponse('plain text content'));

      const wrapper = mount(FilePreview, {
        props: { file, postId: 'p1' },
      });
      await flushPromises();

      expect(wrapper.find('[data-testid="file-preview-text"]').exists()).toBe(true);
    });
  });
});
