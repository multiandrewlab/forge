import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

// vi.hoisted runs before vi.mock hoisting, making the fn available in the factory
const { mockCodeToHtml } = vi.hoisted(() => ({
  mockCodeToHtml: vi.fn(),
}));

vi.mock('shiki', () => ({
  codeToHtml: mockCodeToHtml,
}));

import CodeViewer from '@/components/post/CodeViewer.vue';

describe('CodeViewer', () => {
  beforeEach(() => {
    mockCodeToHtml.mockReset();
    mockCodeToHtml.mockImplementation(
      async (code: string, opts: { lang: string }) =>
        `<pre><code class="lang-${opts.lang}">${code}</code></pre>`,
    );

    // Mock clipboard API
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it('should render syntax-highlighted code via codeToHtml', async () => {
    const wrapper = mount(CodeViewer, {
      props: { code: 'const x = 1;', language: 'typescript' },
    });
    await flushPromises();

    expect(mockCodeToHtml).toHaveBeenCalledWith('const x = 1;', {
      lang: 'typescript',
      theme: 'one-dark-pro',
    });
    expect(wrapper.html()).toContain('lang-typescript');
    expect(wrapper.html()).toContain('const x = 1;');
  });

  it('should default to "text" language when no language prop is provided', async () => {
    const wrapper = mount(CodeViewer, {
      props: { code: 'hello world' },
    });
    await flushPromises();

    expect(mockCodeToHtml).toHaveBeenCalledWith('hello world', {
      lang: 'text',
      theme: 'one-dark-pro',
    });
    expect(wrapper.html()).toContain('lang-text');
  });

  it('should fall back to "text" language when codeToHtml throws for unsupported language', async () => {
    let callCount = 0;
    mockCodeToHtml.mockImplementation(async (code: string, opts: { lang: string }) => {
      callCount++;
      if (callCount === 1 && opts.lang !== 'text') {
        throw new Error('Unsupported language');
      }
      return `<pre><code class="lang-${opts.lang}">${code}</code></pre>`;
    });

    const wrapper = mount(CodeViewer, {
      props: { code: 'some code', language: 'brainfuck' },
    });
    await flushPromises();

    // First call with brainfuck, second fallback call with text
    expect(mockCodeToHtml).toHaveBeenCalledTimes(2);
    expect(mockCodeToHtml).toHaveBeenNthCalledWith(1, 'some code', {
      lang: 'brainfuck',
      theme: 'one-dark-pro',
    });
    expect(mockCodeToHtml).toHaveBeenNthCalledWith(2, 'some code', {
      lang: 'text',
      theme: 'one-dark-pro',
    });
    expect(wrapper.html()).toContain('lang-text');
  });

  it('should render a copy button', async () => {
    const wrapper = mount(CodeViewer, {
      props: { code: 'const x = 1;', language: 'typescript' },
    });
    await flushPromises();

    const button = wrapper.find('button');
    expect(button.exists()).toBe(true);
    expect(button.text()).toBe('Copy');
  });

  it('should copy code to clipboard and show "Copied!" text', async () => {
    vi.useFakeTimers();
    const wrapper = mount(CodeViewer, {
      props: { code: 'const x = 1;', language: 'typescript' },
    });
    await flushPromises();

    const button = wrapper.find('button');
    await button.trigger('click');
    await flushPromises();

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('const x = 1;');
    expect(button.text()).toBe('Copied!');

    // After 2 seconds, text should revert to "Copy"
    vi.advanceTimersByTime(2000);
    await flushPromises();
    expect(button.text()).toBe('Copy');

    vi.useRealTimers();
  });

  it('should re-highlight when code prop changes', async () => {
    const wrapper = mount(CodeViewer, {
      props: { code: 'const x = 1;', language: 'typescript' },
    });
    await flushPromises();

    mockCodeToHtml.mockClear();
    await wrapper.setProps({ code: 'const y = 2;' });
    await flushPromises();

    expect(mockCodeToHtml).toHaveBeenCalledWith('const y = 2;', {
      lang: 'typescript',
      theme: 'one-dark-pro',
    });
  });

  it('should emit line-click when a .line element is clicked', async () => {
    mockCodeToHtml.mockResolvedValue(
      '<pre><code><span class="line">line1</span><span class="line">line2</span><span class="line">line3</span></code></pre>',
    );

    const wrapper = mount(CodeViewer, {
      props: { code: 'line1\nline2\nline3', language: 'text' },
    });
    await flushPromises();

    // .line elements are inside v-html content
    const lineElements = wrapper.findAll('.line');
    expect(lineElements.length).toBe(3);

    await lineElements[1].trigger('click');

    const emitted = wrapper.emitted('line-click') as unknown[][];
    expect(emitted).toBeTruthy();
    expect(emitted[0]).toEqual([2]);
  });

  it('should not emit line-click when click target has no .line ancestor', async () => {
    const wrapper = mount(CodeViewer, {
      props: { code: 'const x = 1;', language: 'typescript' },
    });
    await flushPromises();

    // Click the container div itself, not a .line element
    const codeDiv = wrapper.find('[class*="rounded"]');
    await codeDiv.trigger('click');

    const emitted = wrapper.emitted('line-click');
    expect(emitted).toBeUndefined();
  });

  it('should re-highlight when language prop changes', async () => {
    const wrapper = mount(CodeViewer, {
      props: { code: 'print("hi")', language: 'python' },
    });
    await flushPromises();

    mockCodeToHtml.mockClear();
    await wrapper.setProps({ language: 'javascript' });
    await flushPromises();

    expect(mockCodeToHtml).toHaveBeenCalledWith('print("hi")', {
      lang: 'javascript',
      theme: 'one-dark-pro',
    });
  });
});
