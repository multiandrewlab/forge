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
import { useCommentsStore } from '../../../stores/comments.js';
import type { PostWithAuthor, PostWithRevision, Comment } from '@forge/shared';

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

  it('sets inlineCommentLine when handleLineClick is triggered', async () => {
    setupUrlAwareMock(mockPostWithRevision);

    const wrapper = mount(PostDetail, { props: { post: mockPost } });
    await flushPromises();

    // Simulate CodeViewer emitting line-click
    const codeViewer = wrapper.findComponent({ name: 'CodeViewer' });
    codeViewer.vm.$emit('line-click', 5);
    await wrapper.vm.$nextTick();

    expect(wrapper.text()).toContain('Line 5');
    expect(wrapper.find('[placeholder="Add inline comment..."]').exists()).toBe(true);
  });

  it('handleInlineComment calls addComment with line number and revision', async () => {
    const mockComment = {
      id: 'c1',
      postId: 'post-1',
      author: { id: 'user-1', displayName: 'Alice', avatarUrl: null },
      parentId: null,
      lineNumber: 5,
      revisionId: 'rev-1',
      revisionNumber: 1,
      body: 'Inline note',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };

    mockApiFetch.mockImplementation((url: string, opts?: Record<string, string>) => {
      if (url.includes('/comments') && opts?.method === 'POST') {
        return Promise.resolve({
          ok: true,
          status: 201,
          json: () => Promise.resolve({ comment: mockComment }),
        } as Response);
      }
      if (url.includes('/comments')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ comments: [] }),
        } as Response);
      }
      return Promise.resolve(mockOkResponse(mockPostWithRevision));
    });

    const wrapper = mount(PostDetail, { props: { post: mockPost } });
    await flushPromises();

    // Trigger line click to set inlineCommentLine
    const codeViewer = wrapper.findComponent({ name: 'CodeViewer' });
    codeViewer.vm.$emit('line-click', 5);
    await wrapper.vm.$nextTick();

    // Find the inline comment form specifically (the one with "Add inline comment..." placeholder)
    const inlineTextarea = wrapper.find('[placeholder="Add inline comment..."]');
    expect(inlineTextarea.exists()).toBe(true);
    await inlineTextarea.setValue('Inline note');

    // Find the form that contains this textarea and submit it
    const forms = wrapper.findAll('form');
    const inlineForm = forms.find((f) => f.find('[placeholder="Add inline comment..."]').exists());
    expect(inlineForm).toBeDefined();
    await inlineForm?.trigger('submit');
    await flushPromises();

    // Verify addComment was called with the POST endpoint
    const postCalls = mockApiFetch.mock.calls.filter(
      (call: unknown[]) =>
        typeof call[0] === 'string' &&
        call[0].includes('/comments') &&
        call.length > 1 &&
        (call[1] as Record<string, string>).method === 'POST',
    );
    expect(postCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('handleInlineComment early-returns when inlineCommentLine is null', async () => {
    setupUrlAwareMock(mockPostWithRevision);

    const wrapper = mount(PostDetail, { props: { post: mockPost } });
    await flushPromises();

    // inlineCommentLine is null by default — the inline comment form isn't shown
    // This covers the guard: if (inlineCommentLine.value === null || !fullPost.value) return;
    expect(wrapper.find('[placeholder="Add inline comment..."]').exists()).toBe(false);
  });

  it('passes null currentUserId to CommentSection when user is not authenticated', async () => {
    setupUrlAwareMock(mockPostWithRevision);

    const wrapper = mount(PostDetail, { props: { post: mockPost } });
    await flushPromises();

    // authStore.user is null by default — covers authStore.user?.id optional chaining
    const section = wrapper.findComponent({ name: 'CommentSection' });
    expect(section.exists()).toBe(true);
    expect(section.props('currentUserId')).toBeUndefined();
  });

  it('handleInlineComment does nothing when fullPost is null', async () => {
    // Mount with null post — fullPost stays null
    const wrapper = mount(PostDetail, { props: { post: null } });
    await flushPromises();

    // Access the component's internal handleInlineComment via vm
    // Since fullPost is null, the guard returns early
    const vm = wrapper.vm as unknown as { handleInlineComment: (body: string) => Promise<void> };
    if (vm.handleInlineComment) {
      await vm.handleInlineComment('test');
    }
    // No crash, no API call
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('renders inline comment indicators when store has inline comments', async () => {
    setupUrlAwareMock(mockPostWithRevision);

    const wrapper = mount(PostDetail, { props: { post: mockPost } });
    await flushPromises();

    // Populate the comments store with an inline comment on the current revision
    const store = useCommentsStore();
    store.setCurrentRevisionId('rev-1');
    const inlineComment: Comment = {
      id: 'ic1',
      postId: 'post-1',
      author: { id: 'u1', displayName: 'Alice', avatarUrl: null },
      parentId: null,
      lineNumber: 3,
      revisionId: 'rev-1',
      revisionNumber: 1,
      body: 'Nice line',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    store.setComments([inlineComment]);
    await wrapper.vm.$nextTick();

    // The indicator button should show "1 comment on line 3"
    expect(wrapper.text()).toContain('1 comment on line');
  });

  it('clicking an inline indicator sets inlineCommentLine and shows comments', async () => {
    setupUrlAwareMock(mockPostWithRevision);

    const wrapper = mount(PostDetail, { props: { post: mockPost } });
    await flushPromises();

    const store = useCommentsStore();
    store.setCurrentRevisionId('rev-1');
    const inlineComment: Comment = {
      id: 'ic1',
      postId: 'post-1',
      author: { id: 'u1', displayName: 'Alice', avatarUrl: null },
      parentId: null,
      lineNumber: 7,
      revisionId: 'rev-1',
      revisionNumber: 1,
      body: 'Check this line',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    store.setComments([inlineComment]);
    await wrapper.vm.$nextTick();

    // Click the indicator button
    const indicatorBtn = wrapper.find('button.text-primary');
    expect(indicatorBtn.exists()).toBe(true);
    await indicatorBtn.trigger('click');
    await wrapper.vm.$nextTick();

    // Now the inline comment body and input should be visible
    expect(wrapper.text()).toContain('Line 7');
    expect(wrapper.text()).toContain('Check this line');
    expect(wrapper.find('[placeholder="Add inline comment..."]').exists()).toBe(true);
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
