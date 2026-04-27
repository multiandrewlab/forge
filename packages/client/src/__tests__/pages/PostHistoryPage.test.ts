import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import PostHistoryPage from '@/pages/PostHistoryPage.vue';
import type { PostRevision } from '@forge/shared';

const mockFetchRevisions = vi.fn();
const mockRestoreRevision = vi.fn();
const mockFetchPost = vi.fn();

vi.mock('@/composables/usePosts', () => ({
  usePosts: () => ({
    fetchRevisions: mockFetchRevisions,
    restoreRevision: mockRestoreRevision,
    fetchPost: mockFetchPost,
    currentPost: { value: null },
    error: { value: null },
  }),
}));

const mockRoute = { params: { id: 'post-1' } };
vi.mock('vue-router', () => ({
  useRoute: () => mockRoute,
  useRouter: () => ({ push: vi.fn() }),
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
});
