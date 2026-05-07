import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import KeyboardShortcutsHelp from '@/components/shell/KeyboardShortcutsHelp.vue';

describe('KeyboardShortcutsHelp', () => {
  it('hidden by default', () => {
    const wrapper = mount(KeyboardShortcutsHelp, { props: { open: false } });
    expect(wrapper.find('[data-testid="keyboard-shortcuts-help"]').exists()).toBe(false);
  });

  it('renders all 4 documented shortcuts when open', () => {
    const wrapper = mount(KeyboardShortcutsHelp, { props: { open: true } });
    const dialog = wrapper.find('[data-testid="keyboard-shortcuts-help"]');
    expect(dialog.exists()).toBe(true);
    expect(dialog.text()).toContain('Cmd+K');
    expect(dialog.text()).toContain('n');
    expect(dialog.text()).toContain('/');
    expect(dialog.text()).toContain('?');
  });

  it('emits close when dismiss button is clicked', async () => {
    const wrapper = mount(KeyboardShortcutsHelp, { props: { open: true } });
    await wrapper.find('[data-testid="keyboard-shortcuts-help-close"]').trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('renders with role=dialog and aria-modal=true', () => {
    const wrapper = mount(KeyboardShortcutsHelp, { props: { open: true } });
    const dialog = wrapper.find('[data-testid="keyboard-shortcuts-help"]');
    expect(dialog.attributes('role')).toBe('dialog');
    expect(dialog.attributes('aria-modal')).toBe('true');
  });

  it('emits close when backdrop (self) is clicked', async () => {
    const wrapper = mount(KeyboardShortcutsHelp, { props: { open: true } });
    const dialog = wrapper.find('[data-testid="keyboard-shortcuts-help"]');
    await dialog.trigger('click');
    expect(wrapper.emitted('close')).toBeTruthy();
  });
});
