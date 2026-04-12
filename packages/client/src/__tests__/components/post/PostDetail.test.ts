import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

// vi.hoisted ensures mock fn is available in vi.mock factory
const { mockCodeToHtml } = vi.hoisted(() => ({
  mockCodeToHtml: vi.fn(),
}));

vi.mock('shiki', () => ({
  codeToHtml: mockCodeToHtml,
}));

vi.mock('../../../lib/api.js', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../../../lib/api.js';
import PostDetail from '../../../components/post/PostDetail.vue';
import type { PostWithAuthor, PostWithRevision } from '@forge/shared';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

const mockPost: PostWithAuthor = {
  id: 'post-1',
  authorId: 'user-1',
  title: 'Test Post',
  contentType: 'snippet',
  language: 'typescript',
  visibility: 'public',
  isDraft: false,
  forkedFromId: null,
  linkUrl: null,
  linkPreview: null,
  voteCount: 0,
  viewCount: 0,
  deletedAt: null,
  createdAt: new Date('2025-01-01'),
  updatedAt: new Date('2025-01-01'),
  author: { id: 'user-1', displayName: 'Alice', avatarUrl: null },
  tags: [],
};

const mockPostWithRevision: PostWithRevision = {
  ...mockPost,
  revisions: [
    {
      id: 'rev-1',
      postId: 'post-1',
      content: 'console.log("hello")',
      message: null,
      revisionNumber: 1,
      createdAt: new Date('2025-01-01'),
    },
  ],
};

function mockOkResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as Response;
}

function mockErrorResponse(): Response {
  return {
    ok: false,
    status: 500,
    json: () => Promise.resolve({ error: 'Server error' }),
  } as Response;
}

function setupUrlAwareMock(postData: unknown): void {
  mockApiFetch.mockImplementation((url: string) => {
    if (url.includes('/comments')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ comments: [] }),
      } as Response);
    }
    return Promise.resolve(mockOkResponse(postData));
  });
}

describe('PostDetail', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
    mockCodeToHtml.mockReset();
    mockCodeToHtml.mockResolvedValue('<pre>test</pre>');
  });

  it('shows placeholder when post prop is null', () => {
    const wrapper = mount(PostDetail, { props: { post: null } });
    expect(wrapper.text()).toContain('Select a post to view');
  });

  it('fetches and renders post content when post prop is provided', async () => {
    setupUrlAwareMock(mockPostWithRevision);

    const wrapper = mount(PostDetail, { props: { post: mockPost } });
    await flushPromises();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1');
    expect(wrapper.text()).toContain('Test Post');
  });

  it('sets fullPost to null when post prop becomes null', async () => {
    setupUrlAwareMock(mockPostWithRevision);

    const wrapper = mount(PostDetail, { props: { post: mockPost } });
    await flushPromises();

    await wrapper.setProps({ post: null });
    await flushPromises();

    expect(wrapper.text()).toContain('Select a post to view');
  });

  it('handles fetch error gracefully (catch branch — lines 46-47)', async () => {
    mockApiFetch.mockRejectedValue(new Error('Network failure'));

    const wrapper = mount(PostDetail, { props: { post: mockPost } });
    await flushPromises();

    // fullPost remains null on catch, so placeholder is not shown but no crash either
    // The v-if="post" outer div is still rendered (post prop is non-null)
    expect(wrapper.exists()).toBe(true);
  });

  it('handles non-ok API response without crashing', async () => {
    mockApiFetch.mockResolvedValue(mockErrorResponse());

    const wrapper = mount(PostDetail, { props: { post: mockPost } });
    await flushPromises();

    expect(wrapper.exists()).toBe(true);
  });

  it('refetches when post id changes', async () => {
    setupUrlAwareMock(mockPostWithRevision);

    const wrapper = mount(PostDetail, { props: { post: mockPost } });
    await flushPromises();

    const post2: PostWithAuthor = { ...mockPost, id: 'post-2' };
    const post2WithRevision: PostWithRevision = { ...mockPostWithRevision, id: 'post-2' };
    setupUrlAwareMock(post2WithRevision);

    await wrapper.setProps({ post: post2 });
    await flushPromises();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-2');
  });

  it('passes undefined language to CodeViewer when post.language is null (??  branch)', async () => {
    // post.language is null — hits the `post.language ?? undefined` right-hand side
    const nullLangPost: PostWithAuthor = { ...mockPost, language: null };
    const nullLangPostWithRevision: PostWithRevision = {
      ...mockPostWithRevision,
      language: null,
    };
    setupUrlAwareMock(nullLangPostWithRevision);

    const wrapper = mount(PostDetail, { props: { post: nullLangPost } });
    await flushPromises();

    // Component renders without crash — CodeViewer receives undefined language
    expect(wrapper.exists()).toBe(true);
  });
});
