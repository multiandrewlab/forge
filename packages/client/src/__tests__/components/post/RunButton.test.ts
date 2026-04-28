import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import RunButton from '../../../components/post/RunButton.vue';

describe('RunButton', () => {
  describe('icon rendering', () => {
    it('renders play icon when status is idle', () => {
      const wrapper = mount(RunButton, { props: { status: 'idle' } });
      expect(wrapper.find('[data-testid="run-play"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="run-spinner"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="run-stop"]').exists()).toBe(false);
    });

    it('renders play icon when status is done', () => {
      const wrapper = mount(RunButton, { props: { status: 'done' } });
      expect(wrapper.find('[data-testid="run-play"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="run-spinner"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="run-stop"]').exists()).toBe(false);
    });

    it('renders play icon when status is error', () => {
      const wrapper = mount(RunButton, { props: { status: 'error' } });
      expect(wrapper.find('[data-testid="run-play"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="run-spinner"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="run-stop"]').exists()).toBe(false);
    });

    it('renders spinner when status is loading', () => {
      const wrapper = mount(RunButton, { props: { status: 'loading' } });
      expect(wrapper.find('[data-testid="run-play"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="run-spinner"]').exists()).toBe(true);
      expect(wrapper.find('[data-testid="run-stop"]').exists()).toBe(false);
    });

    it('renders stop icon when status is running', () => {
      const wrapper = mount(RunButton, { props: { status: 'running' } });
      expect(wrapper.find('[data-testid="run-play"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="run-spinner"]').exists()).toBe(false);
      expect(wrapper.find('[data-testid="run-stop"]').exists()).toBe(true);
    });
  });

  describe('click events', () => {
    it('emits run when clicked in idle state', async () => {
      const wrapper = mount(RunButton, { props: { status: 'idle' } });
      await wrapper.find('button').trigger('click');
      expect(wrapper.emitted('run')).toHaveLength(1);
      expect(wrapper.emitted('abort')).toBeFalsy();
    });

    it('emits run when clicked in done state', async () => {
      const wrapper = mount(RunButton, { props: { status: 'done' } });
      await wrapper.find('button').trigger('click');
      expect(wrapper.emitted('run')).toHaveLength(1);
      expect(wrapper.emitted('abort')).toBeFalsy();
    });

    it('emits run when clicked in error state', async () => {
      const wrapper = mount(RunButton, { props: { status: 'error' } });
      await wrapper.find('button').trigger('click');
      expect(wrapper.emitted('run')).toHaveLength(1);
      expect(wrapper.emitted('abort')).toBeFalsy();
    });

    it('emits abort when clicked in running state', async () => {
      const wrapper = mount(RunButton, { props: { status: 'running' } });
      await wrapper.find('button').trigger('click');
      expect(wrapper.emitted('abort')).toHaveLength(1);
      expect(wrapper.emitted('run')).toBeFalsy();
    });

    it('does not emit any event when clicked in loading state', async () => {
      const wrapper = mount(RunButton, { props: { status: 'loading' } });
      await wrapper.find('button').trigger('click');
      expect(wrapper.emitted('run')).toBeFalsy();
      expect(wrapper.emitted('abort')).toBeFalsy();
    });
  });

  describe('disabled state', () => {
    it('disables the button when disabled prop is true', () => {
      const wrapper = mount(RunButton, {
        props: { status: 'idle', disabled: true },
      });
      expect(wrapper.find('button').attributes('disabled')).toBeDefined();
    });

    it('does not emit run when disabled', async () => {
      const wrapper = mount(RunButton, {
        props: { status: 'idle', disabled: true },
      });
      await wrapper.find('button').trigger('click');
      expect(wrapper.emitted('run')).toBeFalsy();
    });

    it('shows disabledReason as title tooltip', () => {
      const wrapper = mount(RunButton, {
        props: { status: 'idle', disabled: true, disabledReason: 'No code to run' },
      });
      expect(wrapper.find('button').attributes('title')).toBe('No code to run');
    });

    it('does not set title when disabledReason is not provided', () => {
      const wrapper = mount(RunButton, {
        props: { status: 'idle' },
      });
      expect(wrapper.find('button').attributes('title')).toBeUndefined();
    });
  });

  describe('aria-labels', () => {
    it('has aria-label "Run code" when showing play icon', () => {
      const wrapper = mount(RunButton, { props: { status: 'idle' } });
      expect(wrapper.find('button').attributes('aria-label')).toBe('Run code');
    });

    it('has aria-label "Run code" when status is done', () => {
      const wrapper = mount(RunButton, { props: { status: 'done' } });
      expect(wrapper.find('button').attributes('aria-label')).toBe('Run code');
    });

    it('has aria-label "Run code" when status is error', () => {
      const wrapper = mount(RunButton, { props: { status: 'error' } });
      expect(wrapper.find('button').attributes('aria-label')).toBe('Run code');
    });

    it('has aria-label "Run code" when status is loading', () => {
      const wrapper = mount(RunButton, { props: { status: 'loading' } });
      expect(wrapper.find('button').attributes('aria-label')).toBe('Run code');
    });

    it('has aria-label "Stop execution" when status is running', () => {
      const wrapper = mount(RunButton, { props: { status: 'running' } });
      expect(wrapper.find('button').attributes('aria-label')).toBe('Stop execution');
    });
  });

  describe('styling', () => {
    it('applies bg-red-500/10 when status is running', () => {
      const wrapper = mount(RunButton, { props: { status: 'running' } });
      expect(wrapper.find('button').classes()).toContain('bg-red-500/10');
    });

    it('applies bg-primary/10 when status is idle', () => {
      const wrapper = mount(RunButton, { props: { status: 'idle' } });
      expect(wrapper.find('button').classes()).toContain('bg-primary/10');
    });

    it('applies opacity-50 and cursor-not-allowed when disabled', () => {
      const wrapper = mount(RunButton, {
        props: { status: 'idle', disabled: true },
      });
      const classes = wrapper.find('button').classes();
      expect(classes).toContain('opacity-50');
      expect(classes).toContain('cursor-not-allowed');
    });

    it('applies cursor-wait when status is loading', () => {
      const wrapper = mount(RunButton, { props: { status: 'loading' } });
      expect(wrapper.find('button').classes()).toContain('cursor-wait');
    });
  });
});
