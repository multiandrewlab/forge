import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { nextTick } from 'vue';

// Mock all CodeMirror language modules before importing the component.
// Each module exports a function that returns an Extension (empty array for test).
vi.mock('vue-codemirror', () => ({
  Codemirror: {
    name: 'Codemirror',
    props: ['modelValue', 'extensions', 'disabled', 'style', 'tabSize', 'indentWithTab'],
    emits: ['update:model-value'],
    template: '<div data-testid="codemirror-stub"><slot /></div>',
  },
}));

vi.mock('@codemirror/theme-one-dark', () => ({
  oneDark: Symbol('oneDark'),
}));

vi.mock('@codemirror/lang-javascript', () => ({
  javascript: vi.fn(() => Symbol('javascript')),
}));

vi.mock('@codemirror/lang-python', () => ({
  python: vi.fn(() => Symbol('python')),
}));

vi.mock('@codemirror/lang-html', () => ({
  html: vi.fn(() => Symbol('html')),
}));

vi.mock('@codemirror/lang-css', () => ({
  css: vi.fn(() => Symbol('css')),
}));

vi.mock('@codemirror/lang-json', () => ({
  json: vi.fn(() => Symbol('json')),
}));

vi.mock('@codemirror/lang-markdown', () => ({
  markdown: vi.fn(() => Symbol('markdown')),
}));

vi.mock('@codemirror/lang-sql', () => ({
  sql: vi.fn(() => Symbol('sql')),
}));

vi.mock('@codemirror/lang-xml', () => ({
  xml: vi.fn(() => Symbol('xml')),
}));

vi.mock('@codemirror/lang-java', () => ({
  java: vi.fn(() => Symbol('java')),
}));

vi.mock('@codemirror/lang-cpp', () => ({
  cpp: vi.fn(() => Symbol('cpp')),
}));

vi.mock('@codemirror/lang-rust', () => ({
  rust: vi.fn(() => Symbol('rust')),
}));

vi.mock('@codemirror/lang-php', () => ({
  php: vi.fn(() => Symbol('php')),
}));

import CodeEditor from '@/components/editor/CodeEditor.vue';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { oneDark } from '@codemirror/theme-one-dark';

describe('CodeEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the Codemirror component', () => {
    const wrapper = mount(CodeEditor, {
      props: {
        modelValue: 'hello world',
      },
    });

    expect(wrapper.find('[data-testid="codemirror-stub"]').exists()).toBe(true);
  });

  it('should pass modelValue to Codemirror', () => {
    const wrapper = mount(CodeEditor, {
      props: {
        modelValue: 'const x = 42;',
      },
    });

    const codemirror = wrapper.findComponent({ name: 'Codemirror' });
    expect(codemirror.props('modelValue')).toBe('const x = 42;');
  });

  it('should apply oneDark theme by default with no language', () => {
    const wrapper = mount(CodeEditor, {
      props: {
        modelValue: '',
      },
    });

    const codemirror = wrapper.findComponent({ name: 'Codemirror' });
    const extensions = codemirror.props('extensions') as symbol[];
    expect(extensions).toHaveLength(1);
    expect(extensions[0]).toBe(oneDark);
  });

  it('should include language extension when language prop is provided', () => {
    const wrapper = mount(CodeEditor, {
      props: {
        modelValue: '',
        language: 'python',
      },
    });

    const codemirror = wrapper.findComponent({ name: 'Codemirror' });
    const extensions = codemirror.props('extensions') as symbol[];
    expect(extensions).toHaveLength(2);
    expect(extensions[0]).toBe(oneDark);
    expect(python).toHaveBeenCalled();
  });

  it('should switch language extension when language prop changes', async () => {
    const wrapper = mount(CodeEditor, {
      props: {
        modelValue: '',
        language: 'python',
      },
    });

    await wrapper.setProps({ language: 'javascript' });
    await nextTick();

    const codemirror = wrapper.findComponent({ name: 'Codemirror' });
    const extensions = codemirror.props('extensions') as symbol[];
    expect(extensions).toHaveLength(2);
    expect(javascript).toHaveBeenCalled();
  });

  it('should pass disabled prop mapped from readonly', () => {
    const wrapper = mount(CodeEditor, {
      props: {
        modelValue: '',
        readonly: true,
      },
    });

    const codemirror = wrapper.findComponent({ name: 'Codemirror' });
    expect(codemirror.props('disabled')).toBe(true);
  });

  it('should emit update:modelValue when content changes', async () => {
    const wrapper = mount(CodeEditor, {
      props: {
        modelValue: '',
      },
    });

    const codemirror = wrapper.findComponent({ name: 'Codemirror' });
    await codemirror.vm.$emit('update:model-value', 'new content');

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();
    expect(emitted?.[0]).toEqual(['new content']);
  });

  it('should call javascript with jsx and typescript options for typescript language', () => {
    mount(CodeEditor, {
      props: {
        modelValue: '',
        language: 'typescript',
      },
    });

    expect(javascript).toHaveBeenCalledWith({ jsx: true, typescript: true });
  });

  it('should call javascript with jsx option for javascript language', () => {
    mount(CodeEditor, {
      props: {
        modelValue: '',
        language: 'javascript',
      },
    });

    expect(javascript).toHaveBeenCalledWith({ jsx: true });
  });

  it('should fall back to oneDark only for unknown language', () => {
    const wrapper = mount(CodeEditor, {
      props: {
        modelValue: '',
        language: 'unknown-lang',
      },
    });

    const codemirror = wrapper.findComponent({ name: 'Codemirror' });
    const extensions = codemirror.props('extensions') as symbol[];
    expect(extensions).toHaveLength(1);
    expect(extensions[0]).toBe(oneDark);
  });
});
