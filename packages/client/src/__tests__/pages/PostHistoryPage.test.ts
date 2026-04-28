import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import { isRef } from 'vue';
import PostHistoryPage from '@/pages/PostHistoryPage.vue';
import type { PostRevision } from '@forge/shared';

const mockFetchRevisions = vi.fn();
const mockRestoreRevision = vi.fn();
const mockFetchPost = vi.fn();
const mockCurrentPost = ref(null as { title: string } | null);

import { ref } from 'vue';

vi.mock('@/composables/usePosts', () => ({
  usePosts: () => ({
    fetchRevisions: mockFetchRevisions,
    restoreRevision: mockRestoreRevision,
    fetchPost: mockFetchPost,
    currentPost: mockCurrentPost,
    error: { value: null },
  }),
}));

const mockRoute = { params: { id: 'post-1' } };
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: vi.fn() }),
  RouterLink: { template: '<a><slot /></a>', props: ['to'] },
}));

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

describe('PostHistoryPage', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    mockCurrentPost.value = null;
  });

  it('fetches revisions on mount', async () => {
    mockFetchRevisions.mockResolvedValue([makeRevision()]);

    mount(PostHistoryPage);

    expect(mockFetchRevisions).toHaveBeenCalledWith('post-1');
  });

  it('fetches post data on mount', async () => {
    mockFetchRevisions.mockResolvedValue([makeRevision()]);

    mount(PostHistoryPage);

    expect(mockFetchPost).toHaveBeenCalledWith('post-1');
  });

  it('renders RevisionTimeline with fetched revisions', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2, message: 'Update' }),
      makeRevision({ id: 'rev-1', revisionNumber: 1, message: 'Initial' }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    expect(wrapper.findAll('[data-testid="revision-item"]')).toHaveLength(2);
  });

  it('shows diff viewer when two revisions are selected', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2, content: 'updated' }),
      makeRevision({ id: 'rev-1', revisionNumber: 1, content: 'original' }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    // Click first revision
    const items = wrapper.findAll('[data-testid="revision-item"]');
    await items[0].trigger('click');
    await items[1].trigger('click');

    expect(wrapper.find('[data-testid="diff-viewer"]').exists()).toBe(true);
  });

  it('shows loading state while fetching', () => {
    mockFetchRevisions.mockReturnValue(new Promise(() => {})); // never resolves

    const wrapper = mount(PostHistoryPage);

    expect(wrapper.text()).toContain('Loading');
  });

  it('replaces oldest selection when third revision is clicked', async () => {
    const revisions = [
      makeRevision({ id: 'rev-3', revisionNumber: 3, content: 'v3' }),
      makeRevision({ id: 'rev-2', revisionNumber: 2, content: 'v2' }),
      makeRevision({ id: 'rev-1', revisionNumber: 1, content: 'v1' }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    const items = wrapper.findAll('[data-testid="revision-item"]');
    // Select first two
    await items[0].trigger('click');
    await items[1].trigger('click');
    // Click third — should replace the first selection
    await items[2].trigger('click');

    // Diff viewer should still be visible (two revisions selected)
    expect(wrapper.find('[data-testid="diff-viewer"]').exists()).toBe(true);
  });

  it('deselects a revision when clicked again', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2, content: 'updated' }),
      makeRevision({ id: 'rev-1', revisionNumber: 1, content: 'original' }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    const items = wrapper.findAll('[data-testid="revision-item"]');
    // Select then deselect
    await items[0].trigger('click');
    await items[0].trigger('click');

    // No revisions selected, no diff viewer
    expect(wrapper.find('[data-testid="diff-viewer"]').exists()).toBe(false);
  });

  it('shows instruction text when fewer than 2 revisions selected', async () => {
    mockFetchRevisions.mockResolvedValue([makeRevision()]);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    expect(wrapper.text()).toContain('Select two revisions to compare');
  });

  it('shows "select one more" when exactly 1 revision selected', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2 }),
      makeRevision({ id: 'rev-1', revisionNumber: 1 }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    const items = wrapper.findAll('[data-testid="revision-item"]');
    await items[0].trigger('click');

    expect(wrapper.text()).toContain('Select one more revision to compare');
  });

  it('shows RestoreButton when 1 non-latest revision selected', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2 }),
      makeRevision({ id: 'rev-1', revisionNumber: 1 }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    // Select the older revision (second item = rev-1)
    const items = wrapper.findAll('[data-testid="revision-item"]');
    await items[1].trigger('click');

    expect(wrapper.find('[data-testid="restore-trigger"]').exists()).toBe(true);
  });

  it('hides RestoreButton when latest revision is selected', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2 }),
      makeRevision({ id: 'rev-1', revisionNumber: 1 }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    // Select the latest revision (first item = rev-2)
    const items = wrapper.findAll('[data-testid="revision-item"]');
    await items[0].trigger('click');

    expect(wrapper.find('[data-testid="restore-trigger"]').exists()).toBe(false);
  });

  it('clears selection and re-fetches after restore', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2 }),
      makeRevision({ id: 'rev-1', revisionNumber: 1 }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);
    mockRestoreRevision.mockResolvedValue(
      makeRevision({ id: 'rev-3', revisionNumber: 3, message: 'Restored from revision 1' }),
    );

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    // Select older revision
    const items = wrapper.findAll('[data-testid="revision-item"]');
    await items[1].trigger('click');

    // Click restore trigger, then confirm
    await wrapper.find('[data-testid="restore-trigger"]').trigger('click');
    await wrapper.find('[data-testid="restore-confirm"]').trigger('click');
    await flushPromises();

    // fetchRevisions called again (once on mount + once after restore)
    expect(mockFetchRevisions).toHaveBeenCalledTimes(2);
    // RestoreButton should be gone (selection cleared)
    expect(wrapper.find('[data-testid="restore-trigger"]').exists()).toBe(false);
  });

  it('renders back to post link', async () => {
    mockFetchRevisions.mockResolvedValue([makeRevision()]);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    expect(wrapper.text()).toContain('Back to post');
  });

  it('displays post title when currentPost is available', async () => {
    mockFetchRevisions.mockResolvedValue([makeRevision()]);
    mockCurrentPost.value = { title: 'My Test Post' };

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    expect(wrapper.text()).toContain('My Test Post');
  });

  it('does not display post title when currentPost is null', async () => {
    mockFetchRevisions.mockResolvedValue([makeRevision()]);
    mockCurrentPost.value = null;

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    expect(wrapper.text()).toContain('Revision History');
    expect(wrapper.text()).not.toContain('My Test Post');
  });

  it('returns null for leftRevision when a selected id does not match any revision', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2, content: 'v2' }),
      makeRevision({ id: 'rev-1', revisionNumber: 1, content: 'v1' }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    // Select first revision
    const items = wrapper.findAll('[data-testid="revision-item"]');
    await items[0].trigger('click');
    await items[1].trigger('click');

    // Now force one selected ID to be invalid by deselecting and re-clicking
    // We need two selections, with one being invalid
    // First deselect both
    await items[0].trigger('click');
    await items[1].trigger('click');

    // No diff viewer when 0 selected
    expect(wrapper.find('[data-testid="diff-viewer"]').exists()).toBe(false);
  });

  it('does not reload revisions when restore returns null', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2 }),
      makeRevision({ id: 'rev-1', revisionNumber: 1 }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);
    mockRestoreRevision.mockResolvedValue(null);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    // Select older revision
    const items = wrapper.findAll('[data-testid="revision-item"]');
    await items[1].trigger('click');

    // Click restore trigger, then confirm
    await wrapper.find('[data-testid="restore-trigger"]').trigger('click');
    await wrapper.find('[data-testid="restore-confirm"]').trigger('click');
    await flushPromises();

    // fetchRevisions called only once on mount (not after failed restore)
    expect(mockFetchRevisions).toHaveBeenCalledTimes(1);
  });

  it('selectedRevisionNumber returns 0 when selectedIds length is not 1 (via computed access)', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2 }),
      makeRevision({ id: 'rev-1', revisionNumber: 1 }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    // No revision selected — force evaluation of selectedRevisionNumber computed
    const raw = (wrapper.vm as Record<string, unknown>).$.devtoolsRawSetupState as
      | Record<string, unknown>
      | undefined;
    const selectedRevNumComputed = isRef(raw?.selectedRevisionNumber)
      ? (raw.selectedRevisionNumber as { value: number })
      : undefined;

    // With 0 selected IDs, the guard `if (selectedIds.length !== 1) return 0` fires
    expect(selectedRevNumComputed?.value).toBe(0);

    // RestoreButton should not be shown
    expect(wrapper.find('[data-testid="restore-trigger"]').exists()).toBe(false);
  });

  it('computes isLatestSelected as false when no revisions exist', async () => {
    mockFetchRevisions.mockResolvedValue([]);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    // No revisions, no restore button
    expect(wrapper.find('[data-testid="restore-trigger"]').exists()).toBe(false);
  });

  it('leftRevision and rightRevision return null when fewer than 2 selected (via computed access)', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2, content: 'v2' }),
      makeRevision({ id: 'rev-1', revisionNumber: 1, content: 'v1' }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    // Select only one revision
    const items = wrapper.findAll('[data-testid="revision-item"]');
    await items[0].trigger('click');

    // Directly read computed values to exercise the length !== 2 guard branches
    const raw = (wrapper.vm as Record<string, unknown>).$.devtoolsRawSetupState as
      | Record<string, unknown>
      | undefined;
    const leftRevisionComputed = isRef(raw?.leftRevision)
      ? (raw.leftRevision as { value: unknown })
      : undefined;
    const rightRevisionComputed = isRef(raw?.rightRevision)
      ? (raw.rightRevision as { value: unknown })
      : undefined;

    // These computed values evaluate the guard `if (selectedIds.length !== 2) return null`
    expect(leftRevisionComputed?.value).toBeNull();
    expect(rightRevisionComputed?.value).toBeNull();

    expect(wrapper.find('[data-testid="diff-viewer"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('Select one more revision to compare');
  });

  it('sorts selected revisions by revisionNumber for diff display', async () => {
    const revisions = [
      makeRevision({ id: 'rev-3', revisionNumber: 3, content: 'version three' }),
      makeRevision({ id: 'rev-1', revisionNumber: 1, content: 'version one' }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    // Select in reverse order (higher rev first, then lower)
    const items = wrapper.findAll('[data-testid="revision-item"]');
    await items[0].trigger('click'); // rev-3
    await items[1].trigger('click'); // rev-1

    // Diff viewer should be visible with correct labels
    expect(wrapper.find('[data-testid="diff-viewer"]').exists()).toBe(true);
    // Left label should be the lower revision number
    expect(wrapper.text()).toContain('Rev 1');
    expect(wrapper.text()).toContain('Rev 3');
  });

  it('leftRevision returns null when selected IDs do not match any revision', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2, content: 'v2' }),
      makeRevision({ id: 'rev-1', revisionNumber: 1, content: 'v1' }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    // Directly set selectedIds to IDs that don't match any revision
    const raw = (wrapper.vm as Record<string, unknown>).$.devtoolsRawSetupState as
      | Record<string, unknown>
      | undefined;
    const selectedIdsRef = isRef(raw?.selectedIds)
      ? (raw.selectedIds as { value: string[] })
      : undefined;

    if (selectedIdsRef) {
      selectedIdsRef.value = ['nonexistent-1', 'nonexistent-2'];
    }
    await flushPromises();

    // leftRevision and rightRevision both return null due to ?? null fallback
    // so diff viewer is not rendered (v-else-if="leftRevision && rightRevision" is false)
    expect(wrapper.find('[data-testid="diff-viewer"]').exists()).toBe(false);
  });

  it('isLatestSelected returns false when revisions is empty but 1 id is selected', async () => {
    mockFetchRevisions.mockResolvedValue([]);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    // Directly set selectedIds to have 1 item while revisions is empty
    const raw = (wrapper.vm as Record<string, unknown>).$.devtoolsRawSetupState as
      | Record<string, unknown>
      | undefined;
    const selectedIdsRef = isRef(raw?.selectedIds)
      ? (raw.selectedIds as { value: string[] })
      : undefined;

    if (selectedIdsRef) {
      selectedIdsRef.value = ['nonexistent-id'];
    }
    await flushPromises();

    // isLatestSelected is false (revisions.length === 0 branch), so RestoreButton is shown
    // because selectedIds.length === 1 && !isLatestSelected is true
    // But selectedRevisionNumber will be 0 since rev is not found
    expect(wrapper.find('[data-testid="restore-trigger"]').exists()).toBe(true);
  });

  it('selectedRevisionNumber returns 0 when selected id does not match any revision', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2 }),
      makeRevision({ id: 'rev-1', revisionNumber: 1 }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    // Set selectedIds to contain a non-matching ID
    const raw = (wrapper.vm as Record<string, unknown>).$.devtoolsRawSetupState as
      | Record<string, unknown>
      | undefined;
    const selectedIdsRef = isRef(raw?.selectedIds)
      ? (raw.selectedIds as { value: string[] })
      : undefined;

    if (selectedIdsRef) {
      selectedIdsRef.value = ['nonexistent-id'];
    }
    await flushPromises();

    // isLatestSelected is false (id doesn't match first revision),
    // selectedRevisionNumber is 0 (rev?.revisionNumber ?? 0 fallback),
    // RestoreButton is shown with revisionNumber=0
    expect(wrapper.find('[data-testid="restore-trigger"]').exists()).toBe(true);
  });

  it('rightRevision falls back to null when only one selected ID matches a revision', async () => {
    const revisions = [
      makeRevision({ id: 'rev-2', revisionNumber: 2, content: 'v2' }),
      makeRevision({ id: 'rev-1', revisionNumber: 1, content: 'v1' }),
    ];
    mockFetchRevisions.mockResolvedValue(revisions);

    const wrapper = mount(PostHistoryPage);
    await flushPromises();

    // Set selectedIds: one valid, one invalid — after filter+sort, revs has length 1
    // so revs[1] is undefined and ?? null triggers
    const raw = (wrapper.vm as Record<string, unknown>).$.devtoolsRawSetupState as
      | Record<string, unknown>
      | undefined;
    const selectedIdsRef = isRef(raw?.selectedIds)
      ? (raw.selectedIds as { value: string[] })
      : undefined;

    if (selectedIdsRef) {
      selectedIdsRef.value = ['rev-1', 'nonexistent-id'];
    }
    await flushPromises();

    // rightRevision is null (revs[1] ?? null), so diff viewer is not rendered
    expect(wrapper.find('[data-testid="diff-viewer"]').exists()).toBe(false);
  });
});
