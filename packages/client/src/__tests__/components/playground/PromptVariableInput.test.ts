import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PromptVariableInput from '@/components/playground/PromptVariableInput.vue';
import type { PromptVariable } from '@forge/shared';

const textVariable: PromptVariable = {
  id: '1',
  postId: 'p1',
  name: 'Language',
  placeholder: 'e.g. TypeScript',
  defaultValue: 'JavaScript',
  sortOrder: 0,
};

const textareaVariable: PromptVariable = {
  id: '2',
  postId: 'p1',
  name: 'Error Log',
  placeholder: 'Paste your error log',
  defaultValue: null,
  sortOrder: 1,
};

describe('PromptVariableInput', () => {
  // --- Test 1: Renders label with variable name ---
  it('renders a label with the variable name', () => {
    const wrapper = mount(PromptVariableInput, {
      props: { variable: textVariable, modelValue: '' },
    });

    const label = wrapper.find('label');
    expect(label.exists()).toBe(true);
    expect(label.text()).toBe('Language');
  });

  // --- Test 2: Renders text input for simple variable names ---
  it('renders a text input for simple variable names without textarea keywords', () => {
    const wrapper = mount(PromptVariableInput, {
      props: { variable: textVariable, modelValue: '' },
    });

    expect(wrapper.find('input[type="text"]').exists()).toBe(true);
    expect(wrapper.find('textarea').exists()).toBe(false);
  });

  // --- Test 3: Renders textarea for names containing "log" ---
  it('renders a textarea when variable name contains "log"', () => {
    const wrapper = mount(PromptVariableInput, {
      props: { variable: textareaVariable, modelValue: '' },
    });

    expect(wrapper.find('textarea').exists()).toBe(true);
    expect(wrapper.find('input[type="text"]').exists()).toBe(false);
  });

  // --- Test 4: Renders textarea for names containing "code" ---
  it('renders a textarea when variable name contains "code"', () => {
    const variable: PromptVariable = {
      ...textVariable,
      name: 'Source Code',
    };
    const wrapper = mount(PromptVariableInput, {
      props: { variable, modelValue: '' },
    });

    expect(wrapper.find('textarea').exists()).toBe(true);
    expect(wrapper.find('input[type="text"]').exists()).toBe(false);
  });

  // --- Test 5: Renders textarea for names containing "content" ---
  it('renders a textarea when variable name contains "content"', () => {
    const variable: PromptVariable = {
      ...textVariable,
      name: 'Page Content',
    };
    const wrapper = mount(PromptVariableInput, {
      props: { variable, modelValue: '' },
    });

    expect(wrapper.find('textarea').exists()).toBe(true);
    expect(wrapper.find('input[type="text"]').exists()).toBe(false);
  });

  // --- Test 6: Renders textarea for names containing "text" ---
  it('renders a textarea when variable name contains "text"', () => {
    const variable: PromptVariable = {
      ...textVariable,
      name: 'Input Text',
    };
    const wrapper = mount(PromptVariableInput, {
      props: { variable, modelValue: '' },
    });

    expect(wrapper.find('textarea').exists()).toBe(true);
    expect(wrapper.find('input[type="text"]').exists()).toBe(false);
  });

  // --- Test 7: Renders textarea for names containing "context" ---
  it('renders a textarea when variable name contains "context"', () => {
    const variable: PromptVariable = {
      ...textVariable,
      name: 'Additional Context',
    };
    const wrapper = mount(PromptVariableInput, {
      props: { variable, modelValue: '' },
    });

    expect(wrapper.find('textarea').exists()).toBe(true);
    expect(wrapper.find('input[type="text"]').exists()).toBe(false);
  });

  // --- Test 8: Shows placeholder from variable.placeholder ---
  it('shows the placeholder from variable.placeholder', () => {
    const wrapper = mount(PromptVariableInput, {
      props: { variable: textVariable, modelValue: '' },
    });

    const input = wrapper.find('input[type="text"]');
    expect(input.attributes('placeholder')).toBe('e.g. TypeScript');
  });

  // --- Test 9: Falls back to "Enter {name}" when placeholder is null ---
  it('falls back to "Enter {name}" when placeholder is null', () => {
    const variable: PromptVariable = {
      ...textVariable,
      placeholder: null,
    };
    const wrapper = mount(PromptVariableInput, {
      props: { variable, modelValue: '' },
    });

    const input = wrapper.find('input[type="text"]');
    expect(input.attributes('placeholder')).toBe('Enter Language');
  });

  // --- Test 10: Emits update:modelValue on input change ---
  it('emits update:modelValue on input change', async () => {
    const wrapper = mount(PromptVariableInput, {
      props: { variable: textVariable, modelValue: '' },
    });

    const input = wrapper.find('input[type="text"]');
    await input.setValue('TypeScript');

    const emitted = wrapper.emitted('update:modelValue');
    expect(emitted).toBeTruthy();
    expect(emitted?.[0]).toEqual(['TypeScript']);
  });

  // --- Test 11: Displays the modelValue prop as input value ---
  it('displays the modelValue prop as the input value', () => {
    const wrapper = mount(PromptVariableInput, {
      props: { variable: textVariable, modelValue: 'Rust' },
    });

    const input = wrapper.find('input[type="text"]');
    expect((input.element as HTMLInputElement).value).toBe('Rust');
  });
});
