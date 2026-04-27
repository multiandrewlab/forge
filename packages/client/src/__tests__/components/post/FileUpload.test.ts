import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import FileUpload from '@/components/post/FileUpload.vue';

describe('FileUpload', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders a drop zone with "+" icon text', () => {
    const wrapper = mount(FileUpload);
    expect(wrapper.text()).toContain('+');
  });

  it('renders "Drop or browse" text', () => {
    const wrapper = mount(FileUpload);
    expect(wrapper.text()).toContain('Drop or browse');
  });

  it('contains a hidden file input', () => {
    const wrapper = mount(FileUpload);
    const input = wrapper.find('input[type="file"]');
    expect(input.exists()).toBe(true);
    // Hidden via class or style
    expect(input.classes()).toContain('hidden');
  });

  it('triggers file input click when button is clicked', async () => {
    const wrapper = mount(FileUpload);
    const input = wrapper.find('input[type="file"]');
    const clickSpy = vi.spyOn(input.element as HTMLInputElement, 'click');

    const button = wrapper.find('button');
    await button.trigger('click');

    expect(clickSpy).toHaveBeenCalled();
  });

  it('emits "upload" with File object on file selection', async () => {
    const wrapper = mount(FileUpload);
    const input = wrapper.find('input[type="file"]');

    const file = new File(['content'], 'test.ts', { type: 'text/typescript' });
    Object.defineProperty(input.element, 'files', { value: [file], writable: false });

    await input.trigger('change');

    const emitted = wrapper.emitted('upload') as File[][];
    expect(emitted).toBeTruthy();
    expect(emitted[0][0]).toBe(file);
  });

  it('emits "upload" for each file when multiple files are selected', async () => {
    const wrapper = mount(FileUpload);
    const input = wrapper.find('input[type="file"]');

    const file1 = new File(['a'], 'a.ts', { type: 'text/typescript' });
    const file2 = new File(['b'], 'b.py', { type: 'text/x-python' });
    Object.defineProperty(input.element, 'files', { value: [file1, file2], writable: false });

    await input.trigger('change');

    const emitted = wrapper.emitted('upload') as File[][];
    expect(emitted).toHaveLength(2);
    expect(emitted[0][0]).toBe(file1);
    expect(emitted[1][0]).toBe(file2);
  });

  it('shows validation error for files > 10MB', async () => {
    const wrapper = mount(FileUpload);
    const input = wrapper.find('input[type="file"]');

    // Create a file > 10MB (10 * 1024 * 1024 + 1 bytes)
    const bigFile = new File([new ArrayBuffer(10 * 1024 * 1024 + 1)], 'huge.bin', {
      type: 'application/octet-stream',
    });
    Object.defineProperty(input.element, 'files', { value: [bigFile], writable: false });

    await input.trigger('change');

    // Should not emit upload
    expect(wrapper.emitted('upload')).toBeFalsy();
    // Should show error message
    expect(wrapper.text()).toContain('10MB');
  });

  it('clears validation error when a valid file is selected after an error', async () => {
    const wrapper = mount(FileUpload);
    const input = wrapper.find('input[type="file"]');

    // First: invalid file
    const bigFile = new File([new ArrayBuffer(10 * 1024 * 1024 + 1)], 'huge.bin');
    Object.defineProperty(input.element, 'files', {
      value: [bigFile],
      writable: true,
      configurable: true,
    });
    await input.trigger('change');
    expect(wrapper.text()).toContain('10MB');

    // Second: valid file
    const smallFile = new File(['ok'], 'small.ts');
    Object.defineProperty(input.element, 'files', {
      value: [smallFile],
      writable: true,
      configurable: true,
    });
    await input.trigger('change');
    expect(wrapper.text()).not.toContain('10MB');
  });

  it('emits "upload" with File on drop', async () => {
    const wrapper = mount(FileUpload);
    const dropZone = wrapper.find('button');

    const file = new File(['dropped'], 'dropped.ts', { type: 'text/typescript' });
    await dropZone.trigger('drop', {
      dataTransfer: { files: [file] },
    });

    const emitted = wrapper.emitted('upload') as File[][];
    expect(emitted).toBeTruthy();
    expect(emitted[0][0]).toBe(file);
  });

  it('shows validation error for dropped files > 10MB', async () => {
    const wrapper = mount(FileUpload);
    const dropZone = wrapper.find('button');

    const bigFile = new File([new ArrayBuffer(10 * 1024 * 1024 + 1)], 'huge.bin');
    await dropZone.trigger('drop', {
      dataTransfer: { files: [bigFile] },
    });

    expect(wrapper.emitted('upload')).toBeFalsy();
    expect(wrapper.text()).toContain('10MB');
  });

  it('adds drag-over styling on dragenter', async () => {
    const wrapper = mount(FileUpload);
    const dropZone = wrapper.find('button');

    await dropZone.trigger('dragenter');
    // Should have a highlight class
    expect(dropZone.classes()).toContain('border-purple-500');
  });

  it('removes drag-over styling on dragleave', async () => {
    const wrapper = mount(FileUpload);
    const dropZone = wrapper.find('button');

    await dropZone.trigger('dragenter');
    expect(dropZone.classes()).toContain('border-purple-500');

    await dropZone.trigger('dragleave');
    expect(dropZone.classes()).not.toContain('border-purple-500');
  });

  it('removes drag-over styling on drop', async () => {
    const wrapper = mount(FileUpload);
    const dropZone = wrapper.find('button');

    await dropZone.trigger('dragenter');
    expect(dropZone.classes()).toContain('border-purple-500');

    const file = new File(['content'], 'test.ts');
    await dropZone.trigger('drop', {
      dataTransfer: { files: [file] },
    });
    expect(dropZone.classes()).not.toContain('border-purple-500');
  });

  it('prevents default on dragover', async () => {
    const wrapper = mount(FileUpload);
    const dropZone = wrapper.find('button');

    const event = new Event('dragover', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    dropZone.element.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('is keyboard accessible (uses native button element)', () => {
    const wrapper = mount(FileUpload);
    const button = wrapper.find('button');
    expect(button.exists()).toBe(true);
    // Native button is keyboard accessible by default
  });

  it('does not emit upload when no files are in the change event', async () => {
    const wrapper = mount(FileUpload);
    const input = wrapper.find('input[type="file"]');

    Object.defineProperty(input.element, 'files', { value: [], writable: false, configurable: true });
    await input.trigger('change');

    expect(wrapper.emitted('upload')).toBeFalsy();
  });

  it('does not emit upload when drop has no dataTransfer files', async () => {
    const wrapper = mount(FileUpload);
    const dropZone = wrapper.find('button');

    await dropZone.trigger('drop', {
      dataTransfer: { files: [] },
    });

    expect(wrapper.emitted('upload')).toBeFalsy();
  });
});
