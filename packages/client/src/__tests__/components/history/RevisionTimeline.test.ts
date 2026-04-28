import { describe, it, expect, beforeEach } from 'vitest';
import { mount, RouterLinkStub } from '@vue/test-utils';
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

const defaultGlobal = { stubs: { RouterLink: RouterLinkStub } };

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
      global: defaultGlobal,
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
      global: defaultGlobal,
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
      global: defaultGlobal,
    });

    const firstItem = wrapper.find('[data-testid="revision-item"]');
    expect(firstItem.text()).toContain('Current');
  });

  it('emits "select" with revision id when clicked', async () => {
    const rev = makeRevision({ id: 'rev-1' });
    const wrapper = mount(RevisionTimeline, {
      props: { revisions: [rev], selectedIds: [] },
      global: defaultGlobal,
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
      global: defaultGlobal,
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
      global: defaultGlobal,
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
      global: defaultGlobal,
    });

    expect(wrapper.text()).toContain('Restored from revision 2');
  });

  it('displays author display name', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ authorDisplayName: 'Alice' })],
        selectedIds: [],
      },
      global: defaultGlobal,
    });

    expect(wrapper.text()).toContain('Alice');
  });

  it('shows initials avatar when no avatar URL', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ authorDisplayName: 'Alice Bob', authorAvatarUrl: null })],
        selectedIds: [],
      },
      global: defaultGlobal,
    });

    expect(wrapper.find('[data-testid="author-avatar"]').text()).toBe('AB');
  });

  it('shows image avatar when avatar URL provided', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ authorAvatarUrl: 'https://example.com/a.png' })],
        selectedIds: [],
      },
      global: defaultGlobal,
    });

    const img = wrapper.find('[data-testid="author-avatar"] img');
    expect(img.exists()).toBe(true);
    expect(img.attributes('src')).toBe('https://example.com/a.png');
  });

  it('renders empty state when no revisions provided', () => {
    const wrapper = mount(RevisionTimeline, {
      props: { revisions: [], selectedIds: [] },
      global: defaultGlobal,
    });

    expect(wrapper.text()).toContain('No revisions');
  });

  it('hides message paragraph when message is null', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ message: null })],
        selectedIds: [],
      },
      global: defaultGlobal,
    });

    // The message paragraph has v-if="rev.message", so it should not render
    const item = wrapper.find('[data-testid="revision-item"]');
    // Should NOT contain a message line but should still show other content
    expect(item.text()).toContain('Rev 1');
    expect(item.text()).not.toContain('Initial version');
  });

  it('shows "?" initials when authorDisplayName is null', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ authorDisplayName: null, authorAvatarUrl: null })],
        selectedIds: [],
      },
      global: defaultGlobal,
    });

    expect(wrapper.find('[data-testid="author-avatar"]').text()).toBe('?');
  });

  it('shows "Unknown" when authorDisplayName is null', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ authorDisplayName: null })],
        selectedIds: [],
      },
      global: defaultGlobal,
    });

    expect(wrapper.text()).toContain('Unknown');
  });

  it('does not show "Restored" badge when message does not start with "Restored from revision"', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ message: 'Fixed a typo' })],
        selectedIds: [],
      },
      global: defaultGlobal,
    });

    expect(wrapper.text()).not.toContain('Restored');
    expect(wrapper.text()).toContain('Fixed a typo');
  });

  it('shows "Restored" badge when message starts with "Restored from revision"', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ message: 'Restored from revision 3' })],
        selectedIds: [],
      },
      global: defaultGlobal,
    });

    expect(wrapper.text()).toContain('Restored');
  });

  it('formats time as minutes ago', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ createdAt: fiveMinutesAgo })],
        selectedIds: [],
      },
      global: defaultGlobal,
    });

    expect(wrapper.text()).toContain('5m ago');
  });

  it('formats time as hours ago', () => {
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ createdAt: threeHoursAgo })],
        selectedIds: [],
      },
      global: defaultGlobal,
    });

    expect(wrapper.text()).toContain('3h ago');
  });

  it('formats time as days ago', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ createdAt: twoDaysAgo })],
        selectedIds: [],
      },
      global: defaultGlobal,
    });

    expect(wrapper.text()).toContain('2d ago');
  });

  it('formats time as locale date when older than 30 days', () => {
    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ createdAt: sixtyDaysAgo })],
        selectedIds: [],
      },
      global: defaultGlobal,
    });

    // Should show a localized date string, not a relative time
    const item = wrapper.find('[data-testid="revision-item"]');
    expect(item.text()).not.toContain('ago');
    expect(item.text()).not.toContain('just now');
  });

  it('formats string date correctly', () => {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [makeRevision({ createdAt: fiveMinutesAgo.toISOString() as unknown as Date })],
        selectedIds: [],
      },
      global: defaultGlobal,
    });

    expect(wrapper.text()).toContain('5m ago');
  });

  it('does not show "Current" badge on non-first revisions', () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2 }),
      makeRevision({ id: 'rev-1', revisionNumber: 1 }),
    ];

    const wrapper = mount(RevisionTimeline, {
      props: { revisions, selectedIds: [] },
      global: defaultGlobal,
    });

    const items = wrapper.findAll('[data-testid="revision-item"]');
    expect(items[1].text()).not.toContain('Current');
  });

  it('applies unselected styles to non-selected revisions', () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2 }),
      makeRevision({ id: 'rev-1', revisionNumber: 1 }),
    ];

    const wrapper = mount(RevisionTimeline, {
      props: { revisions, selectedIds: [] },
      global: defaultGlobal,
    });

    const items = wrapper.findAll('[data-testid="revision-item"]');
    expect(items[0].classes()).toContain('border-gray-700');
    expect(items[0].classes()).not.toContain('ring-2');
  });

  it('shows avatar alt text from authorDisplayName', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [
          makeRevision({ authorAvatarUrl: 'https://example.com/a.png', authorDisplayName: 'Jane' }),
        ],
        selectedIds: [],
      },
      global: defaultGlobal,
    });

    const img = wrapper.find('[data-testid="author-avatar"] img');
    expect(img.attributes('alt')).toBe('Jane');
  });

  it('shows "Author" as avatar alt text when authorDisplayName is null', () => {
    const wrapper = mount(RevisionTimeline, {
      props: {
        revisions: [
          makeRevision({ authorAvatarUrl: 'https://example.com/a.png', authorDisplayName: null }),
        ],
        selectedIds: [],
      },
      global: defaultGlobal,
    });

    const img = wrapper.find('[data-testid="author-avatar"] img');
    expect(img.attributes('alt')).toBe('Author');
  });

  describe('author profile link', () => {
    it('wraps author avatar and name in a RouterLink to user profile', () => {
      const wrapper = mount(RevisionTimeline, {
        props: {
          revisions: [makeRevision({ authorId: 'user-1', authorDisplayName: 'Alice' })],
          selectedIds: [],
        },
        global: defaultGlobal,
      });

      const link = wrapper.findComponent(RouterLinkStub);
      expect(link.exists()).toBe(true);
      expect(link.props('to')).toEqual({
        name: 'user-profile',
        params: { id: 'user-1' },
      });
    });

    it('renders author display name inside the profile link', () => {
      const wrapper = mount(RevisionTimeline, {
        props: {
          revisions: [makeRevision({ authorId: 'user-1', authorDisplayName: 'Alice' })],
          selectedIds: [],
        },
        global: defaultGlobal,
      });

      const links = wrapper.findAllComponents(RouterLinkStub);
      const nameLink = links.find((l) => l.text().includes('Alice'));
      expect(nameLink).toBeDefined();
    });

    it('stops click propagation so parent select handler is not triggered', async () => {
      const wrapper = mount(RevisionTimeline, {
        props: {
          revisions: [makeRevision({ authorId: 'user-1' })],
          selectedIds: [],
        },
        global: defaultGlobal,
      });

      const link = wrapper.findComponent(RouterLinkStub);
      await link.trigger('click');

      // The parent button click handler should NOT fire
      expect(wrapper.emitted('select')).toBeFalsy();
    });
  });
});
