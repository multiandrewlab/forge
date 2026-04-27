import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import RestoreButton from '../../../components/history/RestoreButton.vue';

describe('RestoreButton', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders a restore button with the revision number', () => {
    const wrapper = mount(RestoreButton, {
      props: { revisionNumber: 3, loading: false },
    });

    expect(wrapper.find('button').text()).toContain('Restore');
  });

  it('shows confirmation dialog when clicked', async () => {
    const wrapper = mount(RestoreButton, {
      props: { revisionNumber: 3, loading: false },
    });

    await wrapper.find('[data-testid="restore-trigger"]').trigger('click');

    expect(wrapper.find('[data-testid="restore-dialog"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Restore to revision 3');
  });

  it('emits "restore" when confirmed', async () => {
    const wrapper = mount(RestoreButton, {
      props: { revisionNumber: 3, loading: false },
    });

    await wrapper.find('[data-testid="restore-trigger"]').trigger('click');
    await wrapper.find('[data-testid="restore-confirm"]').trigger('click');

    expect(wrapper.emitted('restore')).toBeTruthy();
    const restoreEvents = wrapper.emitted('restore') as number[][];
    expect(restoreEvents[0]).toEqual([3]);
  });

  it('closes dialog when cancelled', async () => {
    const wrapper = mount(RestoreButton, {
      props: { revisionNumber: 3, loading: false },
    });

    await wrapper.find('[data-testid="restore-trigger"]').trigger('click');
    await wrapper.find('[data-testid="restore-cancel"]').trigger('click');

    expect(wrapper.find('[data-testid="restore-dialog"]').exists()).toBe(false);
    expect(wrapper.emitted('restore')).toBeFalsy();
  });

  it('disables button when loading is true', () => {
    const wrapper = mount(RestoreButton, {
      props: { revisionNumber: 3, loading: true },
    });

    expect(wrapper.find('[data-testid="restore-trigger"]').attributes('disabled')).toBeDefined();
  });

  it('shows loading text when loading', () => {
    const wrapper = mount(RestoreButton, {
      props: { revisionNumber: 3, loading: true },
    });

    expect(wrapper.text()).toContain('Restoring');
  });
});
