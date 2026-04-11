import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import App from '../App.vue';
import HomePage from '../pages/HomePage.vue';

describe('App', () => {
  it('renders without errors', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/', component: HomePage }],
    });

    const wrapper = mount(App, {
      global: {
        plugins: [router, createPinia()],
      },
    });

    await router.isReady();

    expect(wrapper.html()).toContain('Forge');
  });
});
