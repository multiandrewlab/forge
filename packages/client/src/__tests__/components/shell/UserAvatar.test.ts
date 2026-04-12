import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ref } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import UserAvatar from '../../../components/shell/UserAvatar.vue';

const mockLogout = vi.fn().mockResolvedValue(undefined);
const mockUser = ref<{ id: string; displayName: string; avatarUrl: null } | null>({
  id: 'u1',
  displayName: 'Alex Chen',
  avatarUrl: null,
});

vi.mock('../../../composables/useAuth.js', () => ({
  useAuth: () => ({
    user: mockUser,
    logout: mockLogout,
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
    mockLogout.mockReset();
    mockLogout.mockResolvedValue(undefined);
    mockUser.value = { id: 'u1', displayName: 'Alex Chen', avatarUrl: null };
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

  it('computes single-word initials correctly', () => {
    mockUser.value = { id: 'u1', displayName: 'Alice', avatarUrl: null };
    const router = createTestRouter();
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } });
    expect(wrapper.text()).toContain('A');
  });

  it('computes initials with empty display name', () => {
    mockUser.value = { id: 'u1', displayName: '', avatarUrl: null };
    const router = createTestRouter();
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } });
    // Empty name produces empty initials — just verify no crash
    expect(wrapper.exists()).toBe(true);
  });

  it('handles null user for initials computation', () => {
    mockUser.value = null;
    const router = createTestRouter();
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } });
    expect(wrapper.exists()).toBe(true);
  });

  it('closes dropdown after clicking a menu item', async () => {
    const router = createTestRouter();
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } });

    // Open dropdown
    await wrapper.find('button').trigger('click');
    expect(wrapper.text()).toContain('Profile');

    // Click a menu item (Profile — no-op action)
    const menuButtons = wrapper.findAll('button');
    // First button is the avatar toggle, subsequent buttons are menu items
    const profileButton = menuButtons.find((b) => b.text() === 'Profile');
    expect(profileButton).toBeDefined();
    await profileButton?.trigger('click');

    // Dropdown should be closed
    expect(wrapper.text()).not.toContain('Logout');
  });

  it('navigates to /my-snippets when My Snippets is clicked', async () => {
    const router = createTestRouter();
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } });

    await wrapper.find('button').trigger('click');
    const menuButtons = wrapper.findAll('button');
    const snippetsButton = menuButtons.find((b) => b.text() === 'My Snippets');
    expect(snippetsButton).toBeDefined();
    await snippetsButton?.trigger('click');
    await flushPromises();

    expect(router.currentRoute.value.path).toBe('/my-snippets');
  });

  it('calls logout and navigates to /login when Logout is clicked', async () => {
    const router = createTestRouter();
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } });

    await wrapper.find('button').trigger('click');
    const menuButtons = wrapper.findAll('button');
    const logoutButton = menuButtons.find((b) => b.text() === 'Logout');
    expect(logoutButton).toBeDefined();
    await logoutButton?.trigger('click');
    await wrapper.vm.$nextTick();
    // Wait for logout promise
    await new Promise((r) => setTimeout(r, 0));

    expect(mockLogout).toHaveBeenCalled();
    expect(router.currentRoute.value.path).toBe('/login');
  });

  it('clicking Profile menu item closes dropdown (no-op action)', async () => {
    const router = createTestRouter();
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } });

    await wrapper.find('button').trigger('click');
    const menuButtons = wrapper.findAll('button');
    const profileButton = menuButtons.find((b) => b.text() === 'Profile');
    expect(profileButton).toBeDefined();
    await profileButton?.trigger('click');
    await flushPromises();

    // Profile action is a no-op — just verify no crash and dropdown closed
    expect(wrapper.text()).not.toContain('Logout');
  });

  it('clicking Settings menu item closes dropdown (no-op action)', async () => {
    const router = createTestRouter();
    const wrapper = mount(UserAvatar, { global: { plugins: [router] } });

    await wrapper.find('button').trigger('click');
    const menuButtons = wrapper.findAll('button');
    const settingsButton = menuButtons.find((b) => b.text() === 'Settings');
    expect(settingsButton).toBeDefined();
    await settingsButton?.trigger('click');
    await flushPromises();

    // Settings action is a no-op — just verify no crash and dropdown closed
    expect(wrapper.text()).not.toContain('Logout');
  });
});
