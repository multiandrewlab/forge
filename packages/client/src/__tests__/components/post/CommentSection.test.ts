import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

vi.mock('../../../lib/api.js', () => ({
  apiFetch: vi.fn(),
}));

import { apiFetch } from '../../../lib/api.js';
import { useCommentsStore } from '../../../stores/comments.js';
import CommentSection from '../../../components/post/CommentSection.vue';
import type { Comment } from '@forge/shared';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

const generalComment: Comment = {
  id: 'c-1',
  postId: 'post-1',
  author: { id: 'u-1', displayName: 'Alice', avatarUrl: null },
  parentId: null,
  lineNumber: null,
  revisionId: 'rev-1',
  revisionNumber: 1,
  body: 'Great post!',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

const staleComment: Comment = {
  id: 'c-stale',
  postId: 'post-1',
  author: { id: 'u-2', displayName: 'Bob', avatarUrl: null },
  parentId: null,
  lineNumber: 3,
  revisionId: 'old-rev',
  revisionNumber: null,
  body: 'Stale comment',
  createdAt: '2024-12-01T00:00:00Z',
  updatedAt: '2024-12-01T00:00:00Z',
};

const staleCommentWithAuthorNull: Comment = {
  ...staleComment,
  id: 'c-stale-null',
  author: null,
};

const staleCommentWithRevision: Comment = {
  ...staleComment,
  id: 'c-stale-rev',
  revisionNumber: 2,
};

describe('CommentSection', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    mockApiFetch.mockReset();
  });

  it('shows "No comments yet." when there are no comments', () => {
    const wrapper = mount(CommentSection, {
      props: { postId: 'post-1' },
    });
    expect(wrapper.text()).toContain('No comments yet.');
  });

  it('renders the Comments heading', () => {
    const wrapper = mount(CommentSection, {
      props: { postId: 'post-1' },
    });
    expect(wrapper.find('h3').text()).toBe('Comments');
  });

  it('renders general comments via CommentThread when store has comments', () => {
    const store = useCommentsStore();
    store.setComments([generalComment]);

    const wrapper = mount(CommentSection, {
      props: { postId: 'post-1' },
    });

    expect(wrapper.text()).toContain('Great post!');
    expect(wrapper.text()).not.toContain('No comments yet.');
  });

  it('renders stale comments when store has inline comments from older revisions', () => {
    const store = useCommentsStore();
    store.setCurrentRevisionId('rev-current');
    store.setComments([staleComment]);

    const wrapper = mount(CommentSection, {
      props: { postId: 'post-1' },
    });

    expect(wrapper.text()).toContain('Previous comments');
    expect(wrapper.text()).toContain('Stale comment');
    expect(wrapper.text()).toContain('Bob');
  });

  it('shows "Deleted user" for stale comments with null author', () => {
    const store = useCommentsStore();
    store.setCurrentRevisionId('rev-current');
    store.setComments([staleCommentWithAuthorNull]);

    const wrapper = mount(CommentSection, {
      props: { postId: 'post-1' },
    });

    expect(wrapper.text()).toContain('Deleted user');
  });

  it('shows revision number badge for stale comments with revisionNumber', () => {
    const store = useCommentsStore();
    store.setCurrentRevisionId('rev-current');
    store.setComments([staleCommentWithRevision]);

    const wrapper = mount(CommentSection, {
      props: { postId: 'post-1' },
    });

    expect(wrapper.text()).toContain('Left on revision 2');
  });

  it('hides revision badge for stale comments with null revisionNumber', () => {
    const store = useCommentsStore();
    store.setCurrentRevisionId('rev-current');
    store.setComments([staleComment]);

    const wrapper = mount(CommentSection, {
      props: { postId: 'post-1' },
    });

    expect(wrapper.text()).not.toContain('Left on revision');
  });

  it('renders CommentInput for adding new comments', () => {
    const wrapper = mount(CommentSection, {
      props: { postId: 'post-1' },
    });

    const textarea = wrapper.find('textarea');
    expect(textarea.exists()).toBe(true);
    expect(textarea.attributes('placeholder')).toBe('Add a comment...');
  });

  it('submits a new comment via addComment composable', async () => {
    mockApiFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          comment: {
            ...generalComment,
            id: 'c-new',
            body: 'New comment',
          },
        }),
    } as Response);

    const wrapper = mount(CommentSection, {
      props: { postId: 'post-1' },
    });

    const textarea = wrapper.find('textarea');
    await textarea.setValue('New comment');
    await wrapper.find('form').trigger('submit');
    await flushPromises();

    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/post-1/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'New comment' }),
    });
  });

  it('does not show stale comments section when there are none', () => {
    const store = useCommentsStore();
    store.setComments([generalComment]);

    const wrapper = mount(CommentSection, {
      props: { postId: 'post-1' },
    });

    expect(wrapper.text()).not.toContain('Previous comments');
  });

  it('passes currentUserId to CommentThread', () => {
    const store = useCommentsStore();
    store.setComments([generalComment]);

    const wrapper = mount(CommentSection, {
      props: { postId: 'post-1', currentUserId: 'u-1' },
    });

    // The edit/delete buttons should appear since the user owns the comment
    expect(wrapper.text()).toContain('Edit');
    expect(wrapper.text()).toContain('Delete');
  });
});
