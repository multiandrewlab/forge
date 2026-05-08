import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import ErrorToast from '@/components/feedback/ErrorToast.vue';
import { useToastStore } from '@/stores/toast';

describe('ErrorToast', () => {
  beforeEach(() => setActivePinia(createPinia()));

  it('renders nothing when queue empty', () => {
    const wrapper = mount(ErrorToast);
    expect(wrapper.find('[data-testid="error-toast"]').exists()).toBe(false);
  });

  it('renders one toast per queued entry', () => {
    const store = useToastStore();
    store.push({ kind: 'error', message: 'First failure' });
    store.push({ kind: 'error', message: 'Second failure' });
    const wrapper = mount(ErrorToast);
    const items = wrapper.findAll('[data-testid="error-toast"]');
    expect(items).toHaveLength(2);
    expect(items[0]?.text()).toContain('First failure');
    expect(items[1]?.text()).toContain('Second failure');
  });

  it('dismiss button removes the toast from the store', async () => {
    const store = useToastStore();
    store.push({ kind: 'error', message: 'Boom' });
    const wrapper = mount(ErrorToast);
    await wrapper.find('[data-testid="error-toast-dismiss"]').trigger('click');
    expect(store.toasts).toHaveLength(0);
    expect(wrapper.find('[data-testid="error-toast"]').exists()).toBe(false);
  });

  it('marks toasts with role=status for assistive tech', () => {
    const store = useToastStore();
    store.push({ kind: 'error', message: 'Boom' });
    const wrapper = mount(ErrorToast);
    const node = wrapper.find('[data-testid="error-toast"]');
    expect(node.attributes('role')).toBe('status');
    expect(node.attributes('aria-live')).toBe('polite');
  });
});
