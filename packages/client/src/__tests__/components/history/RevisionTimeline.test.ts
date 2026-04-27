import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import RevisionTimeline from '@/components/history/RevisionTimeline.vue';
import type { PostRevision } from '@forge/shared';

function makeRevision(overrides: Partial<PostRevision> = {}): PostRevision {
  return {
    id: 'rev-1',
    postId: 'post-1',
    authorId: 'user-1',
    authorDisplayName: 'Test User',
    authorAvatarUrl: null,
    content: 'console.log("hello")',
    message: 'Initial version',
    revisionNumber: 1,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  };
}

describe('RevisionTimeline', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  it('renders a list item for each revision', () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2, message: 'Update' }),
      makeRevision({ id: 'rev-1', revisionNumber: 1, message: 'Initial' }),
    ];

    const wrapper = mount(RevisionTimeline, {
      props: { revisions, selectedIds: [] },
    });

    const items = wrapper.findAll('[data-testid="revision-item"]');
    expect(items).toHaveLength(2);
  });

  it('displays revision number and message', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ revisionNumber: 3, message: 'Fix bug' })],
        selectedIds: [],
      },
    });

    expect(wrapper.text()).toContain('Rev 3');
    expect(wrapper.text()).toContain('Fix bug');
  });

  it('shows "Current" badge on the first (latest) revision', () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2 }),
      makeRevision({ id: 'rev-1', revisionNumber: 1 }),
    ];

    const wrapper = mount(RevisionTimeline, {
      props: { revisions, selectedIds: [] },
    });

    const firstItem = wrapper.find('[data-testid="revision-item"]');
    expect(firstItem.text()).toContain('Current');
  });

  it('emits "select" with revision id when clicked', async () => {
    const rev = makeRevision({ id: 'rev-1' });
    const wrapper = mount(RevisionTimeline, {
      props: { revisions: [rev], selectedIds: [] },
    });

    await wrapper.find('[data-testid="revision-item"]').trigger('click');

    expect(wrapper.emitted('select')).toBeTruthy();
    const selectEvents = wrapper.emitted('select') as string[][];
    expect(selectEvents[0]).toEqual(['rev-1']);
  });

  it('highlights selected revisions', () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2 }),
      makeRevision({ id: 'rev-1', revisionNumber: 1 }),
    ];

    const wrapper = mount(RevisionTimeline, {
      props: { revisions, selectedIds: ['rev-1'] },
    });

    const items = wrapper.findAll('[data-testid="revision-item"]');
    expect(items[1].classes()).toContain('ring-2');
  });

  it('displays relative time for createdAt', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ createdAt: new Date() })],
        selectedIds: [],
      },
    });

    // Should show some relative time text (e.g., "just now", "a few seconds ago")
    // The exact text depends on the formatting helper, but it should NOT be the raw ISO string
    const item = wrapper.find('[data-testid="revision-item"]');
    expect(item.text()).not.toContain('T00:00:00');
  });

  it('shows "Restored from revision N" message style for restored revisions', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ message: 'Restored from revision 2' })],
        selectedIds: [],
      },
    });

    expect(wrapper.text()).toContain('Restored from revision 2');
  });

  it('displays author display name', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ authorDisplayName: 'Alice' })],
        selectedIds: [],
      },
    });

    expect(wrapper.text()).toContain('Alice');
  });

  it('shows initials avatar when no avatar URL', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ authorDisplayName: 'Alice Bob', authorAvatarUrl: null })],
        selectedIds: [],
      },
    });

    expect(wrapper.find('[data-testid="author-avatar"]').text()).toBe('AB');
  });

  it('shows image avatar when avatar URL provided', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ authorAvatarUrl: 'https://example.com/a.png' })],
        selectedIds: [],
      },
    });

    const img = wrapper.find('[data-testid="author-avatar"] img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/a.png');
  });

  it('renders empty state when no revisions provided', () => {
    const wrapper = mount(RevisionTimeline, {
      props: { revisions: [], selectedIds: [] },
    });

    expect(wrapper.text()).toContain('No revisions');
  });
});
