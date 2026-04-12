import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PostListFilters from '../../../components/post/PostListFilters.vue';
import type { FeedSort } from '@forge/shared';

describe('PostListFilters', () => {
  it('renders three tab buttons', () => {
    const wrapper = mount(PostListFilters, {
      props: { modelValue: 'trending' as FeedSort },
    });
    const buttons = wrapper.findAll('button');
    expect(buttons.length).toBe(3);
    expect(buttons[0].text()).toBe('Trending');
    expect(buttons[1].text()).toBe('Recent');
    expect(buttons[2].text()).toBe('Top');
  });

  it('applies active class to the currently selected tab', () => {
    const wrapper = mount(PostListFilters, {
      props: { modelValue: 'recent' as FeedSort },
    });
    const buttons = wrapper.findAll('button');
    // "Recent" button should have the active class
    expect(buttons[1].classes()).toContain('text-primary');
    // Others should not
    expect(buttons[0].classes()).toContain('text-gray-400');
    expect(buttons[2].classes()).toContain('text-gray-400');
  });

  it('emits update:modelValue with the tab value when a tab is clicked', async () => {
    const wrapper = mount(PostListFilters, {
      props: { modelValue: 'trending' as FeedSort },
    });
    const buttons = wrapper.findAll('button');

    // Click "Recent"
    await buttons[1].trigger('click');
    expect(wrapper.emitted('update:modelValue')).toBeTruthy();
    const emitted = wrapper.emitted('update:modelValue') as unknown[][];
    expect(emitted[0]).toEqual(['recent']);
  });

  it('emits update:modelValue with "top" when Top tab is clicked', async () => {
    const wrapper = mount(PostListFilters, {
      props: { modelValue: 'trending' as FeedSort },
    });
    const buttons = wrapper.findAll('button');
    await buttons[2].trigger('click');
    const emitted = wrapper.emitted('update:modelValue') as unknown[][];
    expect(emitted[0]).toEqual(['top']);
  });

  it('emits update:modelValue with "trending" when Trending tab is clicked', async () => {
    const wrapper = mount(PostListFilters, {
      props: { modelValue: 'recent' as FeedSort },
    });
    const buttons = wrapper.findAll('button');
    await buttons[0].trigger('click');
    const emitted = wrapper.emitted('update:modelValue') as unknown[][];
    expect(emitted[0]).toEqual(['trending']);
  });
});
