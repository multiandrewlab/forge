import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createWebHistory, RouterLink } from 'vue-router';
import Breadcrumbs from '@/components/feedback/Breadcrumbs.vue';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: { template: '<div/>' } },
    { path: '/posts/:id', name: 'post-view', component: { template: '<div/>' } },
  ],
});

describe('Breadcrumbs', () => {
  it('renders nothing for a single-item trail', () => {
    const wrapper = mount(Breadcrumbs, {
      props: { items: [{ label: 'Home', to: '/' }] },
      global: { plugins: [router] },
    });
    expect(wrapper.find('[data-testid="breadcrumbs"]').exists()).toBe(false);
  });

  it('renders an ordered trail with the last item as plain text', () => {
    const wrapper = mount(Breadcrumbs, {
      props: {
        items: [
          { label: 'Home', to: '/' },
          { label: 'My snippet', to: null },
        ],
      },
      global: { plugins: [router] },
    });
    expect(wrapper.find('[data-testid="breadcrumbs"]').exists()).toBe(true);
    const links = wrapper.findAllComponents(RouterLink);
    expect(links).toHaveLength(1);
    expect(links[0]?.props('to')).toBe('/');
    expect(wrapper.find('[data-testid="breadcrumb-current"]').text()).toBe('My snippet');
  });

  it('renders nav with aria-label="Breadcrumb"', () => {
    const wrapper = mount(Breadcrumbs, {
      props: {
        items: [
          { label: 'Home', to: '/' },
          { label: 'X', to: null },
        ],
      },
      global: { plugins: [router] },
    });
    const nav = wrapper.find('[data-testid="breadcrumbs"]');
    expect(nav.element.tagName).toBe('NAV');
    expect(nav.attributes('aria-label')).toBe('Breadcrumb');
  });

  it('renders a non-last item with to=null as plain text (intermediate breadcrumb-N testid)', () => {
    const wrapper = mount(Breadcrumbs, {
      props: {
        items: [
          { label: 'Section', to: null },
          { label: 'Subsection', to: '/posts/abc' },
          { label: 'Leaf', to: null },
        ],
      },
      global: { plugins: [router] },
    });
    // The middle item has a non-null `to` and is not the last → renders as a link.
    const links = wrapper.findAllComponents(RouterLink);
    expect(links).toHaveLength(1);
    expect(links[0]?.props('to')).toBe('/posts/abc');
    // The first item has `to: null` and is not the last → renders as a span with
    // `breadcrumb-0` testid (NOT `breadcrumb-current`) and no aria-current.
    const intermediate = wrapper.find('[data-testid="breadcrumb-0"]');
    expect(intermediate.exists()).toBe(true);
    expect(intermediate.text()).toBe('Section');
    expect(intermediate.attributes('aria-current')).toBeUndefined();
    // Last item is the "current" page.
    const current = wrapper.find('[data-testid="breadcrumb-current"]');
    expect(current.text()).toBe('Leaf');
    expect(current.attributes('aria-current')).toBe('page');
  });

  it('renders the last item as plain text even if it has a non-null `to`', () => {
    const wrapper = mount(Breadcrumbs, {
      props: {
        items: [
          { label: 'Home', to: '/' },
          { label: 'Last with link', to: '/posts/xyz' },
        ],
      },
      global: { plugins: [router] },
    });
    // Only the first item should be a link; the last is always a plain span.
    const links = wrapper.findAllComponents(RouterLink);
    expect(links).toHaveLength(1);
    expect(links[0]?.props('to')).toBe('/');
    const current = wrapper.find('[data-testid="breadcrumb-current"]');
    expect(current.text()).toBe('Last with link');
    expect(current.attributes('aria-current')).toBe('page');
  });
});
