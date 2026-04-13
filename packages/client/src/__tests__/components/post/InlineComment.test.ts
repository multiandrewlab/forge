import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import InlineComment from '../../../components/post/InlineComment.vue';
import type { Comment } from '@forge/shared';

const baseComment: Comment = {
  id: 'c-1',
  postId: 'post-1',
  author: { id: 'u-1', displayName: 'Alice', avatarUrl: null },
  parentId: null,
  lineNumber: 5,
  revisionId: 'rev-1',
  revisionNumber: 1,
  body: 'Looks good!',
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2025-01-01T00:00:00Z',
};

describe('InlineComment', () => {
  it('renders comment body', () => {
    const wrapper = mount(InlineComment, { props: { comment: baseComment } });
    expect(wrapper.text()).toContain('Looks good!');
  });

  it('renders author display name', () => {
    const wrapper = mount(InlineComment, { props: { comment: baseComment } });
    expect(wrapper.text()).toContain('Alice');
  });

  it('shows "Deleted user" when author is null', () => {
    const comment: Comment = { ...baseComment, author: null };
    const wrapper = mount(InlineComment, { props: { comment } });
    expect(wrapper.text()).toContain('Deleted user');
  });

  it('shows revision number when present', () => {
    const wrapper = mount(InlineComment, { props: { comment: baseComment } });
    expect(wrapper.text()).toContain('Left on revision 1');
  });

  it('hides revision info when revisionNumber is null', () => {
    const comment: Comment = { ...baseComment, revisionNumber: null };
    const wrapper = mount(InlineComment, { props: { comment } });
    expect(wrapper.text()).not.toContain('Left on revision');
  });

  it('preserves whitespace in body via whitespace-pre-wrap class', () => {
    const comment: Comment = { ...baseComment, body: 'line1\nline2' };
    const wrapper = mount(InlineComment, { props: { comment } });
    const bodyEl = wrapper.find('p');
    expect(bodyEl.classes()).toContain('whitespace-pre-wrap');
    expect(bodyEl.text()).toContain('line1\nline2');
  });
});
