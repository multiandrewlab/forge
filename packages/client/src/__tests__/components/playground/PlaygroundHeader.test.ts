import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { nextTick } from 'vue';
import PlaygroundHeader from '@/components/playground/PlaygroundHeader.vue';

const mockForkPost = vi.fn();
const mockPush = vi.fn();
vi.mock('@/composables/usePosts', () => ({
  usePosts: () => ({ forkPost: mockForkPost }),
}));
vi.mock('vue-router', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('PlaygroundHeader', () => {
  beforeEach(() => {
    mockForkPost.mockReset();
    mockPush.mockReset();
  });

  describe('title rendering', () => {
    it('should render the title text', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'My Prompt', isRunning: false },
      });
      expect(wrapper.text()).toContain('My Prompt');
    });

    it('should render the title with the playground-title testid', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'My Prompt', isRunning: false },
      });
      const title = wrapper.find('[data-testid="playground-title"]');
      expect(title.exists()).toBe(true);
      expect(title.text()).toBe('My Prompt');
    });
  });

  describe('button label', () => {
    it('should show "Run" button when not running', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: false },
      });
      const button = wrapper.find('[data-testid="playground-run-btn"]');
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe('Run');
    });

    it('should show "Stop" button when running', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: true },
      });
      const button = wrapper.find('[data-testid="playground-stop-btn"]');
      expect(button.exists()).toBe(true);
      expect(button.text()).toBe('Stop');
    });

    it('should not render Stop button when not running', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: false },
      });
      expect(wrapper.find('[data-testid="playground-stop-btn"]').exists()).toBe(false);
    });

    it('should not render Run button when running', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: true },
      });
      expect(wrapper.find('[data-testid="playground-run-btn"]').exists()).toBe(false);
    });
  });

  describe('event emission', () => {
    it('should emit "run" event when Run button is clicked', async () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: false, canRun: true },
      });
      await wrapper.find('[data-testid="playground-run-btn"]').trigger('click');

      const emitted = wrapper.emitted('run');
      expect(emitted).toBeTruthy();
      expect(emitted).toHaveLength(1);
    });

    it('should emit "stop" event when Stop button is clicked', async () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: true },
      });
      await wrapper.find('[data-testid="playground-stop-btn"]').trigger('click');

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
      const button = wrapper.find('[data-testid="playground-run-btn"]');
      expect(button.classes()).toContain('bg-primary');
    });

    it('should style Stop button with red color', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: true },
      });
      const button = wrapper.find('[data-testid="playground-stop-btn"]');
      expect(button.classes()).toContain('bg-red-600');
    });
  });

  describe('canRun prop', () => {
    it('should disable Run button when canRun is false', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: false, canRun: false },
      });
      const btn = wrapper.find('[data-testid="playground-run-btn"]');
      expect((btn.element as HTMLButtonElement).disabled).toBe(true);
    });

    it('should enable Run button when canRun is true', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: false, canRun: true },
      });
      const btn = wrapper.find('[data-testid="playground-run-btn"]');
      expect((btn.element as HTMLButtonElement).disabled).toBe(false);
    });

    it('should enable Run button by default when canRun is omitted', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: false },
      });
      const btn = wrapper.find('[data-testid="playground-run-btn"]');
      expect((btn.element as HTMLButtonElement).disabled).toBe(false);
    });
  });

  describe('fork button visibility', () => {
    it('hides fork button when sourcePostId is not provided', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: { title: 'Test', isRunning: false },
      });
      expect(wrapper.find('[data-testid="playground-fork-btn"]').exists()).toBe(false);
    });

    it('shows fork button when sourcePostId is provided', () => {
      const wrapper = mount(PlaygroundHeader, {
        props: {
          title: 'Test',
          isRunning: false,
          canRun: true,
          sourcePostId: 'src',
          contentType: 'prompt',
        },
      });
      expect(wrapper.find('[data-testid="playground-fork-btn"]').exists()).toBe(true);
    });
  });

  describe('handleFork', () => {
    it('case 1: contentType prompt navigates to /playground/{newId}', async () => {
      mockForkPost.mockResolvedValue('new-id');
      const w = mount(PlaygroundHeader, {
        props: {
          title: 'T',
          isRunning: false,
          canRun: true,
          sourcePostId: 'src',
          contentType: 'prompt',
        },
      });
      await w.find('[data-testid="playground-fork-btn"]').trigger('click');
      await flushPromises();
      expect(mockForkPost).toHaveBeenCalledWith('src');
      expect(mockPush).toHaveBeenCalledWith('/playground/new-id');
    });

    it('case 2: contentType snippet navigates to /posts/{newId}/edit', async () => {
      mockForkPost.mockResolvedValue('new-id');
      const w = mount(PlaygroundHeader, {
        props: {
          title: 'T',
          isRunning: false,
          canRun: true,
          sourcePostId: 'src',
          contentType: 'snippet',
        },
      });
      await w.find('[data-testid="playground-fork-btn"]').trigger('click');
      await flushPromises();
      expect(mockPush).toHaveBeenCalledWith('/posts/new-id/edit');
    });

    it('case 3: forkPost returns null no navigation', async () => {
      mockForkPost.mockResolvedValue(null);
      const w = mount(PlaygroundHeader, {
        props: {
          title: 'T',
          isRunning: false,
          canRun: true,
          sourcePostId: 'src',
          contentType: 'prompt',
        },
      });
      await w.find('[data-testid="playground-fork-btn"]').trigger('click');
      await flushPromises();
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('case 4: router.push is awaited (forkPost resolves before navigation)', async () => {
      const order: string[] = [];
      mockForkPost.mockImplementation(async () => {
        order.push('fork');
        return 'new-id';
      });
      mockPush.mockImplementation(async () => {
        order.push('push');
      });
      const w = mount(PlaygroundHeader, {
        props: {
          title: 'T',
          isRunning: false,
          canRun: true,
          sourcePostId: 'src',
          contentType: 'prompt',
        },
      });
      await w.find('[data-testid="playground-fork-btn"]').trigger('click');
      await flushPromises();
      expect(order).toEqual(['fork', 'push']);
    });

    it('case 5: rapid double-click only forks once (isForking guard)', async () => {
      // Stall forkPost so the "second click" lands while the first is in
      // flight. Two issues to navigate in test setup:
      //   1) After the first click, isForking flips true and the button
      //      gains :disabled — a subsequent trigger('click') on a disabled
      //      button does NOT call the @click handler in jsdom (handler is
      //      gated by the disabled attribute), so we'd never enter handleFork
      //      a second time and the early-return guard at line 35 would not
      //      be exercised.
      //   2) Calling handleFork programmatically would require defineExpose,
      //      which we don't want to add purely for tests.
      // Workaround: dispatch the second click event directly via the Event
      // constructor, which bypasses the disabled gate and reaches Vue's
      // bound handler — proving the in-script `if (isForking.value) return;`
      // guard is the second line of defense (the :disabled is the first).
      let resolveFork!: (id: string) => void;
      mockForkPost.mockImplementation(
        () =>
          new Promise<string>((res) => {
            resolveFork = res;
          }),
      );
      const w = mount(PlaygroundHeader, {
        props: {
          title: 'T',
          isRunning: false,
          canRun: true,
          sourcePostId: 'src',
          contentType: 'prompt',
        },
      });
      const btn = w.find('[data-testid="playground-fork-btn"]');
      const btnEl = btn.element as HTMLButtonElement;
      await btn.trigger('click');
      // First click is in flight, button is disabled.
      expect(mockForkPost).toHaveBeenCalledTimes(1);
      expect(btnEl.disabled).toBe(true);
      // Second click via dispatchEvent (bypasses disabled gate) — must hit
      // the script-level isForking guard and NOT re-enter forkPost.
      btnEl.dispatchEvent(new Event('click', { bubbles: true }));
      await nextTick();
      expect(mockForkPost).toHaveBeenCalledTimes(1);
      resolveFork('new-id');
      await flushPromises();
      expect(mockPush).toHaveBeenCalledTimes(1);
      expect(mockPush).toHaveBeenCalledWith('/playground/new-id');
      // After settle, the guard releases so a future fork can proceed.
      expect(btnEl.disabled).toBe(false);
    });
  });
});
