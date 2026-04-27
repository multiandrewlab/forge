import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import FileSidebar from '@/components/post/FileSidebar.vue';
import type { PostFile } from '@forge/shared';

function makeFile(overrides: Partial<PostFile> = {}): PostFile {
  return {
    id: 'f1',
    postId: 'p1',
    revisionId: null,
    filename: 'main.ts',
    mimeType: 'text/typescript',
    fileSize: 1024,
    sortOrder: 0,
    createdAt: new Date('2025-01-01'),
    ...overrides,
  };
}

describe('FileSidebar', () => {
  const files: PostFile[] = [
    makeFile({ id: 'f1', filename: 'main.ts', fileSize: 1024, sortOrder: 0 }),
    makeFile({ id: 'f2', filename: 'utils.py', fileSize: 2048, sortOrder: 1 }),
    makeFile({ id: 'f3', filename: 'README.md', fileSize: 512, sortOrder: 2 }),
  ];

  it('renders file count in the header', () => {
    const wrapper = mount(FileSidebar, {
      props: { files, activeFileId: null, editable: false },
    });
    expect(wrapper.text()).toContain('Files (3)');
  });

  it('renders all filenames', () => {
    const wrapper = mount(FileSidebar, {
      props: { files, activeFileId: null, editable: false },
    });
    expect(wrapper.text()).toContain('main.ts');
    expect(wrapper.text()).toContain('utils.py');
    expect(wrapper.text()).toContain('README.md');
  });

  it('renders formatted file sizes', () => {
    const wrapper = mount(FileSidebar, {
      props: { files, activeFileId: null, editable: false },
    });
    // 1024 bytes = 1.0 KB, 2048 bytes = 2.0 KB, 512 bytes = 512 B
    expect(wrapper.text()).toContain('1.0 KB');
    expect(wrapper.text()).toContain('2.0 KB');
    expect(wrapper.text()).toContain('512 B');
  });

  it('formats null fileSize as "0 B"', () => {
    const wrapper = mount(FileSidebar, {
      props: {
        files: [makeFile({ id: 'f-null', fileSize: null })],
        activeFileId: null,
        editable: false,
      },
    });
    expect(wrapper.text()).toContain('0 B');
  });

  it('formats zero fileSize as "0 B"', () => {
    const wrapper = mount(FileSidebar, {
      props: {
        files: [makeFile({ id: 'f-zero', fileSize: 0 })],
        activeFileId: null,
        editable: false,
      },
    });
    expect(wrapper.text()).toContain('0 B');
  });

  it('formats megabyte-range sizes', () => {
    const wrapper = mount(FileSidebar, {
      props: {
        files: [makeFile({ id: 'f-mb', fileSize: 1048576 })],
        activeFileId: null,
        editable: false,
      },
    });
    expect(wrapper.text()).toContain('1.0 MB');
  });

  it('highlights the active file with purple styling', () => {
    const wrapper = mount(FileSidebar, {
      props: { files, activeFileId: 'f2', editable: false },
    });
    const buttons = wrapper.findAll('button');
    // f2 is the second button (index 1)
    expect(buttons[1].classes()).toContain('bg-purple-500/20');
    expect(buttons[1].classes()).toContain('text-purple-300');
  });

  it('does not highlight inactive files', () => {
    const wrapper = mount(FileSidebar, {
      props: { files, activeFileId: 'f1', editable: false },
    });
    const buttons = wrapper.findAll('button');
    // f2 (index 1) should not be highlighted
    expect(buttons[1].classes()).not.toContain('bg-purple-500/20');
    expect(buttons[1].classes()).toContain('text-gray-400');
  });

  it('emits "select" with file ID when a file is clicked', async () => {
    const wrapper = mount(FileSidebar, {
      props: { files, activeFileId: null, editable: false },
    });
    const buttons = wrapper.findAll('button');
    await buttons[1].trigger('click');

    const emitted = wrapper.emitted('select') as string[][];
    expect(emitted).toBeTruthy();
    expect(emitted[0]).toEqual(['f2']);
  });

  it('shows upload slot when editable is true', () => {
    const wrapper = mount(FileSidebar, {
      props: { files, activeFileId: null, editable: true },
      slots: {
        upload: '<div data-testid="upload-zone">Upload here</div>',
      },
    });
    expect(wrapper.find('[data-testid="upload-zone"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('Upload here');
  });

  it('does not show upload slot when editable is false', () => {
    const wrapper = mount(FileSidebar, {
      props: { files, activeFileId: null, editable: false },
      slots: {
        upload: '<div data-testid="upload-zone">Upload here</div>',
      },
    });
    expect(wrapper.find('[data-testid="upload-zone"]').exists()).toBe(false);
  });

  it('renders empty state with zero file count', () => {
    const wrapper = mount(FileSidebar, {
      props: { files: [], activeFileId: null, editable: false },
    });
    expect(wrapper.text()).toContain('Files (0)');
    expect(wrapper.findAll('button')).toHaveLength(0);
  });
});
