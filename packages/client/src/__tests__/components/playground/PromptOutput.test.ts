import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import PromptOutput from '@/components/playground/PromptOutput.vue';

describe('PromptOutput', () => {
  let wrapper: VueWrapper;

  const defaultProps = {
    output: '',
    isRunning: false,
    error: null as string | null,
  };

  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  // --- Test 1: Shows placeholder when empty and not running ---
  it('shows placeholder when output is empty and not running', () => {
    wrapper = mount(PromptOutput, { props: { ...defaultProps } });

    expect(wrapper.text()).toContain('Click Run to generate output');
  });

  // --- Test 2: Shows "Generating..." when running with no output ---
  it('shows "Generating..." indicator when isRunning is true with no output', () => {
    wrapper = mount(PromptOutput, {
      props: { ...defaultProps, isRunning: true },
    });

    expect(wrapper.text()).toContain('Generating...');
  });

  // --- Test 3: Renders output text in a monospace pre tag ---
  it('renders output text in a pre tag', () => {
    wrapper = mount(PromptOutput, {
      props: { ...defaultProps, output: 'Hello world' },
    });

    const pre = wrapper.find('pre');
    expect(pre.exists()).toBe(true);
    expect(pre.text()).toBe('Hello world');
    expect(pre.classes()).toContain('font-mono');
  });

  // --- Test 4: Shows "Generating..." while streaming with output ---
  it('shows "Generating..." indicator while streaming with output present', () => {
    wrapper = mount(PromptOutput, {
      props: { ...defaultProps, output: 'partial output', isRunning: true },
    });

    expect(wrapper.text()).toContain('partial output');
    expect(wrapper.text()).toContain('Generating...');
  });

  // --- Test 5: Shows error message when error is set ---
  it('shows error message when error prop is set', () => {
    wrapper = mount(PromptOutput, {
      props: { ...defaultProps, error: 'Something went wrong' },
    });

    expect(wrapper.text()).toContain('Something went wrong');
  });

  // --- Test 6: Shows copy button when output exists ---
  it('shows copy button when output exists', () => {
    wrapper = mount(PromptOutput, {
      props: { ...defaultProps, output: 'some output' },
    });

    const copyBtn = wrapper.find('[data-testid="copy-button"]');
    expect(copyBtn.exists()).toBe(true);
  });

  // --- Test 7: Hides copy button when output is empty ---
  it('hides copy button when output is empty', () => {
    wrapper = mount(PromptOutput, { props: { ...defaultProps } });

    const copyBtn = wrapper.find('[data-testid="copy-button"]');
    expect(copyBtn.exists()).toBe(false);
  });

  // --- Test 8: Copies output to clipboard on button click ---
  it('copies output to clipboard on button click', async () => {
    wrapper = mount(PromptOutput, {
      props: { ...defaultProps, output: 'copy me' },
    });

    const copyBtn = wrapper.find('[data-testid="copy-button"]');
    await copyBtn.trigger('click');

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('copy me');
  });

  // --- Test 9: Copied state resets after timeout ---
  it('resets copied state after timeout', async () => {
    vi.useFakeTimers();
    wrapper = mount(PromptOutput, {
      props: { ...defaultProps, output: 'copy me' },
    });

    const copyBtn = wrapper.find('[data-testid="copy-button"]');
    await copyBtn.trigger('click');
    expect(wrapper.text()).toContain('Copied!');

    vi.advanceTimersByTime(2000);
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain('Copy');

    vi.useRealTimers();
  });
});
