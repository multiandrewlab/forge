import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PlaygroundHeader from '@/components/playground/PlaygroundHeader.vue';

describe('PlaygroundHeader', () => {
  describe('title rendering', () => {
    it('should render the title text', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'My Prompt', isRunning: false },
      });
      expect(wrapper.text()).toContain('My Prompt');
    });
  });

  describe('button label', () => {
    it('should show "Run" button when not running', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: false },
      });
      const button = wrapper.find('button');
      expect(button.text()).toBe('Run');
    });

    it('should show "Stop" button when running', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: true },
      });
      const button = wrapper.find('button');
      expect(button.text()).toBe('Stop');
    });
  });

  describe('event emission', () => {
    it('should emit "run" event when Run button is clicked', async () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: false },
      });
      await wrapper.find('button').trigger('click');

      const emitted = wrapper.emitted('run');
      expect(emitted).toBeTruthy();
      expect(emitted).toHaveLength(1);
    });

    it('should emit "stop" event when Stop button is clicked', async () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: true },
      });
      await wrapper.find('button').trigger('click');

      const emitted = wrapper.emitted('stop');
      expect(emitted).toBeTruthy();
      expect(emitted).toHaveLength(1);
    });
  });

  describe('button styling', () => {
    it('should style Run button with primary color', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: false },
      });
      const button = wrapper.find('button');
      expect(button.classes()).toContain('bg-primary');
    });

    it('should style Stop button with red color', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: true },
      });
      const button = wrapper.find('button');
      expect(button.classes()).toContain('bg-red-600');
    });
  });
});
