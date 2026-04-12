import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount } from '@vue/test-utils';
import DraftStatus from '@/components/editor/DraftStatus.vue';

describe('DraftStatus', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('status text', () => {
    it('should display "Saving..." when status is saving', () => {
      const wrapper = mount(DraftStatus, {
        props: { status: 'saving', lastSavedAt: null },
      });

      expect(wrapper.text()).toBe('Saving...');
    });

    it('should display "Save failed" when status is error', () => {
      const wrapper = mount(DraftStatus, {
        props: { status: 'error', lastSavedAt: null },
      });

      expect(wrapper.text()).toBe('Save failed');
    });

    it('should display "Unsaved changes" when status is unsaved', () => {
      const wrapper = mount(DraftStatus, {
        props: { status: 'unsaved', lastSavedAt: null },
      });

      expect(wrapper.text()).toBe('Unsaved changes');
    });

    it('should display "Draft saved" when status is saved with no lastSavedAt', () => {
      const wrapper = mount(DraftStatus, {
        props: { status: 'saved', lastSavedAt: null },
      });

      expect(wrapper.text()).toBe('Draft saved');
    });

    it('should display "Draft saved just now" when saved less than 5 seconds ago', () => {
      const savedAt = new Date('2026-01-15T11:59:57Z'); // 3 seconds ago
      const wrapper = mount(DraftStatus, {
        props: { status: 'saved', lastSavedAt: savedAt },
      });

      expect(wrapper.text()).toBe('Draft saved just now');
    });

    it('should display "Draft saved Ns ago" when saved 5-59 seconds ago', () => {
      const savedAt = new Date('2026-01-15T11:59:30Z'); // 30 seconds ago
      const wrapper = mount(DraftStatus, {
        props: { status: 'saved', lastSavedAt: savedAt },
      });

      expect(wrapper.text()).toBe('Draft saved 30s ago');
    });

    it('should display "Draft saved Nm ago" when saved 60+ seconds ago', () => {
      const savedAt = new Date('2026-01-15T11:57:00Z'); // 3 minutes ago
      const wrapper = mount(DraftStatus, {
        props: { status: 'saved', lastSavedAt: savedAt },
      });

      expect(wrapper.text()).toBe('Draft saved 3m ago');
    });
  });

  describe('status color', () => {
    it('should apply text-green-400 when status is saved', () => {
      const wrapper = mount(DraftStatus, {
        props: { status: 'saved', lastSavedAt: null },
      });

      expect(wrapper.find('span').classes()).toContain('text-green-400');
    });

    it('should apply text-gray-400 when status is saving', () => {
      const wrapper = mount(DraftStatus, {
        props: { status: 'saving', lastSavedAt: null },
      });

      expect(wrapper.find('span').classes()).toContain('text-gray-400');
    });

    it('should apply text-red-400 when status is error', () => {
      const wrapper = mount(DraftStatus, {
        props: { status: 'error', lastSavedAt: null },
      });

      expect(wrapper.find('span').classes()).toContain('text-red-400');
    });

    it('should apply text-yellow-400 when status is unsaved', () => {
      const wrapper = mount(DraftStatus, {
        props: { status: 'unsaved', lastSavedAt: null },
      });

      expect(wrapper.find('span').classes()).toContain('text-yellow-400');
    });

    it('should always apply text-xs class', () => {
      const wrapper = mount(DraftStatus, {
        props: { status: 'saved', lastSavedAt: null },
      });

      expect(wrapper.find('span').classes()).toContain('text-xs');
    });
  });
});
