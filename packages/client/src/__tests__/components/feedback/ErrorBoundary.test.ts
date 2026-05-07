import { describe, it, expect } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { defineComponent, h } from 'vue';
import ErrorBoundary from '@/components/feedback/ErrorBoundary.vue';

const Throws = defineComponent({
  setup() {
    throw new Error('Render bomb');
  },
  render: () => h('div'),
});

const Healthy = defineComponent({
  render: () => h('div', { 'data-testid': 'happy-child' }, 'OK'),
});

describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    const wrapper = mount(ErrorBoundary, { slots: { default: () => h(Healthy) } });
    expect(wrapper.find('[data-testid="happy-child"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="error-boundary-fallback"]').exists()).toBe(false);
  });

  it('renders the fallback when a child throws synchronously', async () => {
    const wrapper = mount(ErrorBoundary, { slots: { default: () => h(Throws) } });
    await flushPromises();
    expect(wrapper.find('[data-testid="error-boundary-fallback"]').exists()).toBe(true);
  });

  it('coerces non-Error throws to a string message', async () => {
    const ThrowsString = defineComponent({
      setup() {
        throw 'just a string';
      },
      render: () => h('div'),
    });

    const wrapper = mount(ErrorBoundary, { slots: { default: () => h(ThrowsString) } });
    await flushPromises();
    const fallback = wrapper.find('[data-testid="error-boundary-fallback"]');
    expect(fallback.exists()).toBe(true);
    expect(fallback.text()).toContain('just a string');
  });

  it('exposes a try-again button that resets state', async () => {
    let throwOnSetup = true;
    const ToggleThrows = defineComponent({
      setup() {
        if (throwOnSetup) throw new Error('first time');
        return () => h('div', { 'data-testid': 'recovered' }, 'OK');
      },
    });

    const wrapper = mount(ErrorBoundary, { slots: { default: () => h(ToggleThrows) } });
    await flushPromises();
    expect(wrapper.find('[data-testid="error-boundary-fallback"]').exists()).toBe(true);
    throwOnSetup = false;
    await wrapper.find('[data-testid="error-boundary-retry"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="recovered"]').exists()).toBe(true);
  });
});
