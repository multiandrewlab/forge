import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import UserAvatar from '../../../components/shell/UserAvatar.vue';

vi.mock('../../../composables/useAuth.js', () => ({
  useAuth: () => ({
    user: { value: { id: 'u1', displayName: 'Alex Chen', avatarUrl: null } },
    logout: vi.fn().mockResolvedValue(undefined),
  }),
}));

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/my-snippets', component: { template: '<div />' } },
      { path: '/login', component: { template: '<div />' } },
    ],
  });
}

describe('UserAvatar', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders user initials', () => {
    const router = createTestRouter();
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } });
    expect(wrapper.text()).toContain('AC');
  });

  it('shows dropdown with all menu items on click', async () => {
    const router = createTestRouter();
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } });
    await wrapper.find('button').trigger('click');
    expect(wrapper.text()).toContain('Profile');
    expect(wrapper.text()).toContain('My Snippets');
    expect(wrapper.text()).toContain('Settings');
    expect(wrapper.text()).toContain('Logout');
  });
});
