import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import PostListItem from '../../../components/post/PostListItem.vue';
import type { PostWithAuthor } from '@forge/shared';

const mockPost: PostWithAuthor = {
  id: '1',
  authorId: 'u1',
  title: 'Test Post',
  contentType: 'snippet',
  language: 'ts',
  visibility: 'public',
  isDraft: false,
  forkedFromId: null,
  linkUrl: null,
  linkPreview: null,
  voteCount: 5,
  viewCount: 10,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  author: { id: 'u1', displayName: 'Test User', avatarUrl: null },
  tags: [],
};

function createTestRouter() {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', component: { template: '<div />' } },
      { path: '/posts/:id', component: { template: '<div />' } },
    ],
  });
}

describe('PostListItem', () => {
  beforeEach(() => {
    // Reset matchMedia to desktop default before each test
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }), // desktop: max-width:767px does NOT match
    });
  });

  it('emits select on click (desktop)', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: false }), // >767px = false for max-width:767px
    });
    const router = createTestRouter();
    const wrapper = mount(PostListItem, {
      props: { post: mockPost, selected: false },
      global: { plugins: [router] },
    });
    await wrapper.trigger('click');
    expect(wrapper.emitted('select')).toBeTruthy();
    const emitted = wrapper.emitted('select') as unknown[][];
    expect(emitted[0]).toEqual(['1']);
  });

  it('navigates to /posts/:id on click (mobile)', async () => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: vi.fn().mockReturnValue({ matches: true }), // max-width:767px matches = mobile
    });
    const router = createTestRouter();
    const pushSpy = vi.spyOn(router, 'push');
    const wrapper = mount(PostListItem, {
      props: { post: mockPost, selected: false },
      global: { plugins: [router] },
    });
    await wrapper.trigger('click');
    expect(pushSpy).toHaveBeenCalledWith('/posts/1');
  });

  it('shows draft badge when isDraft is true', () => {
    const router = createTestRouter();
    const draftPost = { ...mockPost, isDraft: true };
    const wrapper = mount(PostListItem, {
      props: { post: draftPost, selected: false },
      global: { plugins: [router] },
    });
    expect(wrapper.text()).toContain('Draft');
  });
});
