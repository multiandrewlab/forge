import { describe, it, expect, beforeEach } from 'vitest';
import { mount } from '@vue/test-utils';
import { setActivePinia, createPinia } from 'pinia';
import RevisionDiffViewer from '@/components/history/RevisionDiffViewer.vue';

describe('RevisionDiffViewer', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
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
});
