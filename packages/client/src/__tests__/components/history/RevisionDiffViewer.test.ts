import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';

const actualDiff = await vi.importActual<typeof import('diff')>('diff');

const mockDiffLines = vi.fn((...args: Parameters<typeof actualDiff.diffLines>) =>
  actualDiff.diffLines(...args),
);
vi.mock('diff', () => ({
  diffLines: (...args: unknown[]) => mockDiffLines(...args),
}));

import RevisionDiffViewer from '@/components/history/RevisionDiffViewer.vue';

describe('RevisionDiffViewer', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    // Default: delegate to real implementation
    mockDiffLines.mockImplementation((...args: Parameters<typeof actualDiff.diffLines>) =>
      actualDiff.diffLines(...args),
    );
  });

  it('renders diff between two content strings', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'line one\nline two',
        rightContent: 'line one\nline three',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    expect(wrapper.find('[data-testid="diff-viewer"]').exists()).toBe(true);
  });

  it('shows additions in green with + prefix', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'hello',
        rightContent: 'hello\nworld',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    const added = wrapper.findAll('[data-testid="diff-added"]');
    expect(added.length).toBeGreaterThan(0);
    expect(added[0].text()).toContain('+');
    expect(added[0].classes()).toContain('bg-green-900/40');
  });

  it('shows deletions in red with - prefix', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'hello\nworld',
        rightContent: 'hello',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    const removed = wrapper.findAll('[data-testid="diff-removed"]');
    expect(removed.length).toBeGreaterThan(0);
    expect(removed[0].text()).toContain('-');
    expect(removed[0].classes()).toContain('bg-red-900/40');
  });

  it('shows unchanged lines without prefix markers', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'same\ndifferent',
        rightContent: 'same\nchanged',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    const unchanged = wrapper.findAll('[data-testid="diff-unchanged"]');
    expect(unchanged.length).toBeGreaterThan(0);
  });

  it('defaults to inline mode', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'a',
        rightContent: 'b',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    expect(wrapper.find('[data-testid="mode-inline"]').classes()).toContain('bg-gray-600');
  });

  it('toggles to side-by-side mode', async () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'a',
        rightContent: 'b',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    await wrapper.find('[data-testid="mode-side-by-side"]').trigger('click');

    expect(wrapper.find('[data-testid="mode-side-by-side"]').classes()).toContain('bg-gray-600');
    expect(wrapper.find('[data-testid="diff-side-by-side"]').exists()).toBe(true);
  });

  it('renders side-by-side view with two columns', async () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'hello',
        rightContent: 'world',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    await wrapper.find('[data-testid="mode-side-by-side"]').trigger('click');

    expect(wrapper.find('[data-testid="side-left"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="side-right"]').exists()).toBe(true);
  });

  it('shows column headers with labels in side-by-side mode', async () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'a',
        rightContent: 'b',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    await wrapper.find('[data-testid="mode-side-by-side"]').trigger('click');

    expect(wrapper.text()).toContain('Rev 1');
    expect(wrapper.text()).toContain('Rev 2');
  });

  it('shows deletions in left panel in side-by-side mode', async () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'hello\nworld',
        rightContent: 'hello',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    await wrapper.find('[data-testid="mode-side-by-side"]').trigger('click');

    const leftPanel = wrapper.find('[data-testid="side-left"]');
    const removed = leftPanel.findAll('[data-testid="diff-removed"]');
    expect(removed.length).toBeGreaterThan(0);
    expect(removed[0].text()).toContain('-');
  });

  it('shows additions in right panel in side-by-side mode', async () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'hello',
        rightContent: 'hello\nworld',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    await wrapper.find('[data-testid="mode-side-by-side"]').trigger('click');

    const rightPanel = wrapper.find('[data-testid="side-right"]');
    const added = rightPanel.findAll('[data-testid="diff-added"]');
    expect(added.length).toBeGreaterThan(0);
    expect(added[0].text()).toContain('+');
  });

  it('shows "No differences" when contents are identical', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'same content',
        rightContent: 'same content',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    expect(wrapper.text()).toContain('No differences');
  });

  it('shows "No differences" even in side-by-side mode when contents are identical', async () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'same content',
        rightContent: 'same content',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    await wrapper.find('[data-testid="mode-side-by-side"]').trigger('click');

    // isIdentical is true, so the "No differences" message shows instead of side-by-side
    expect(wrapper.text()).toContain('No differences');
    expect(wrapper.find('[data-testid="diff-side-by-side"]').exists()).toBe(false);
  });

  it('applies hover:bg-gray-700 to inactive mode button', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'a',
        rightContent: 'b',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    // Inline is active (bg-gray-600), side-by-side should have hover class
    expect(wrapper.find('[data-testid="mode-side-by-side"]').classes()).toContain(
      'hover:bg-gray-700',
    );
    expect(wrapper.find('[data-testid="mode-inline"]').classes()).toContain('bg-gray-600');
  });

  it('applies hover:bg-gray-700 to inline button when side-by-side is active', async () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'a',
        rightContent: 'b',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    await wrapper.find('[data-testid="mode-side-by-side"]').trigger('click');

    expect(wrapper.find('[data-testid="mode-inline"]').classes()).toContain('hover:bg-gray-700');
    expect(wrapper.find('[data-testid="mode-side-by-side"]').classes()).toContain('bg-gray-600');
  });

  it('renders inline diff with added, removed, and unchanged lines together', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'keep\nremove-me',
        rightContent: 'keep\nadd-me',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    const added = wrapper.findAll('[data-testid="diff-added"]');
    const removed = wrapper.findAll('[data-testid="diff-removed"]');
    const unchanged = wrapper.findAll('[data-testid="diff-unchanged"]');

    expect(added.length).toBeGreaterThan(0);
    expect(removed.length).toBeGreaterThan(0);
    expect(unchanged.length).toBeGreaterThan(0);

    // Verify correct classes on each type
    expect(added[0].classes()).toContain('bg-green-900/40');
    expect(added[0].classes()).toContain('text-green-300');
    expect(removed[0].classes()).toContain('bg-red-900/40');
    expect(removed[0].classes()).toContain('text-red-300');
    expect(unchanged[0].classes()).toContain('text-gray-400');
  });

  it('renders side-by-side unchanged lines in both panels', async () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'shared\nold-line',
        rightContent: 'shared\nnew-line',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    await wrapper.find('[data-testid="mode-side-by-side"]').trigger('click');

    const leftPanel = wrapper.find('[data-testid="side-left"]');
    const rightPanel = wrapper.find('[data-testid="side-right"]');

    // Left panel has both unchanged and removed lines
    const leftUnchanged = leftPanel.findAll('[data-testid="diff-unchanged"]');
    const leftRemoved = leftPanel.findAll('[data-testid="diff-removed"]');
    expect(leftUnchanged.length).toBeGreaterThan(0);
    expect(leftRemoved.length).toBeGreaterThan(0);

    // Right panel has both unchanged and added lines
    const rightUnchanged = rightPanel.findAll('[data-testid="diff-unchanged"]');
    const rightAdded = rightPanel.findAll('[data-testid="diff-added"]');
    expect(rightUnchanged.length).toBeGreaterThan(0);
    expect(rightAdded.length).toBeGreaterThan(0);

    // Unchanged lines should have text-gray-400 in both panels
    expect(leftUnchanged[0].classes()).toContain('text-gray-400');
    expect(rightUnchanged[0].classes()).toContain('text-gray-400');
  });

  it('handles multi-line changes by splitting into individual lines', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'line1\nline2\nline3',
        rightContent: 'line1\nchanged2\nchanged3',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    // Multiple removed and added lines should be present
    const removed = wrapper.findAll('[data-testid="diff-removed"]');
    const added = wrapper.findAll('[data-testid="diff-added"]');
    expect(removed.length).toBeGreaterThanOrEqual(2);
    expect(added.length).toBeGreaterThanOrEqual(2);
  });

  it('uses correct prefix symbols in inline mode for all line types', () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'keep\nold',
        rightContent: 'keep\nnew',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    const added = wrapper.findAll('[data-testid="diff-added"]');
    const removed = wrapper.findAll('[data-testid="diff-removed"]');

    // Added lines show +, removed lines show -
    expect(added[0].text()).toContain('+');
    expect(removed[0].text()).toContain('-');
  });

  it('uses correct prefix symbols in side-by-side mode for both panels', async () => {
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'keep\nold',
        rightContent: 'keep\nnew',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    await wrapper.find('[data-testid="mode-side-by-side"]').trigger('click');

    const leftPanel = wrapper.find('[data-testid="side-left"]');
    const rightPanel = wrapper.find('[data-testid="side-right"]');

    // Left panel: unchanged lines show space prefix, removed lines show -
    const leftUnchanged = leftPanel.findAll('[data-testid="diff-unchanged"]');
    const leftRemoved = leftPanel.findAll('[data-testid="diff-removed"]');
    expect(leftRemoved[0].text()).toContain('-');
    // Unchanged lines in left panel don't have - prefix
    expect(leftUnchanged[0].text()).not.toMatch(/^\s*-/);

    // Right panel: unchanged lines show space prefix, added lines show +
    const rightUnchanged = rightPanel.findAll('[data-testid="diff-unchanged"]');
    const rightAdded = rightPanel.findAll('[data-testid="diff-added"]');
    expect(rightAdded[0].text()).toContain('+');
    // Unchanged lines in right panel don't have + prefix
    expect(rightUnchanged[0].text()).not.toMatch(/^\s*\+/);
  });

  it('exercises all computed getters with mixed content in both modes', async () => {
    // Mount with different content to ensure diffParts, sideBySideLeft, sideBySideRight are all called
    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'keep\nremove-me\nshared',
        rightContent: 'keep\nadd-me\nshared',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    // Inline mode: exercises diffParts computed
    expect(wrapper.findAll('[data-testid="diff-added"]').length).toBeGreaterThan(0);
    expect(wrapper.findAll('[data-testid="diff-removed"]').length).toBeGreaterThan(0);
    expect(wrapper.findAll('[data-testid="diff-unchanged"]').length).toBeGreaterThan(0);

    // Switch to side-by-side: exercises sideBySideLeft and sideBySideRight computeds
    await wrapper.find('[data-testid="mode-side-by-side"]').trigger('click');

    const leftPanel = wrapper.find('[data-testid="side-left"]');
    const rightPanel = wrapper.find('[data-testid="side-right"]');

    expect(leftPanel.findAll('[data-testid="diff-removed"]').length).toBeGreaterThan(0);
    expect(leftPanel.findAll('[data-testid="diff-unchanged"]').length).toBeGreaterThan(0);
    expect(rightPanel.findAll('[data-testid="diff-added"]').length).toBeGreaterThan(0);
    expect(rightPanel.findAll('[data-testid="diff-unchanged"]').length).toBeGreaterThan(0);

    // Switch back to inline to re-exercise that mode
    await wrapper.find('[data-testid="mode-inline"]').trigger('click');
    expect(wrapper.findAll('[data-testid="diff-added"]').length).toBeGreaterThan(0);
  });

  it('coerces undefined added/removed to false via ?? fallback', () => {
    // The diff library normally returns explicit booleans for added/removed,
    // but the ?? false fallback handles when they are undefined.
    mockDiffLines.mockReturnValue([
      { value: 'unchanged-line\n', count: 1 },
      { value: 'added-line\n', count: 1, added: true, removed: false },
      { value: 'removed-line\n', count: 1, added: false, removed: true },
    ]);

    const wrapper = mount(RevisionDiffViewer, {
      props: {
        leftContent: 'anything',
        rightContent: 'different',
        leftLabel: 'Rev 1',
        rightLabel: 'Rev 2',
      },
    });

    // The unchanged chunk has no added/removed properties (undefined),
    // so ?? false provides the fallback value
    const unchanged = wrapper.findAll('[data-testid="diff-unchanged"]');
    expect(unchanged.length).toBeGreaterThan(0);

    const added = wrapper.findAll('[data-testid="diff-added"]');
    expect(added.length).toBeGreaterThan(0);

    const removed = wrapper.findAll('[data-testid="diff-removed"]');
    expect(removed.length).toBeGreaterThan(0);
  });
});
