import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import { ref, nextTick } from 'vue';
import type { Router } from 'vue-router';
import type { Pinia } from 'pinia';
import type { Ref } from 'vue';
import type { PromptVariable } from '@forge/shared';

// --- Mock usePlayground composable ---
const mockFetchVariables = vi.fn();
const mockRun = vi.fn();
const mockStop = vi.fn();
const mockVariables: Ref<PromptVariable[]> = ref([]);
const mockIsRunning = ref(false);
const mockError: Ref<string | null> = ref(null);
const mockOutput = ref('');

vi.mock('@/composables/usePlayground', () => ({
  usePlayground: () => ({
    variables: mockVariables,
    isRunning: mockIsRunning,
    error: mockError,
    output: mockOutput,
    fetchVariables: mockFetchVariables,
    run: mockRun,
    stop: mockStop,
  }),
}));

// --- Mock apiFetch ---
const mockApiFetch = vi.fn();

vi.mock('@/lib/api', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

// --- Mock child components ---
vi.mock('@/components/playground/PlaygroundHeader.vue', () => ({
  default: {
    name: 'PlaygroundHeader',
    props: ['title', 'isRunning'],
    emits: ['run', 'stop'],
    template:
      '<div data-testid="playground-header">' +
      '<span data-testid="header-title">{{ title }}</span>' +
      '<button data-testid="run-btn" @click="$emit(\'run\')">Run</button>' +
      '<button data-testid="stop-btn" @click="$emit(\'stop\')">Stop</button>' +
      '</div>',
  },
}));

vi.mock('@/components/playground/PromptVariableInput.vue', () => ({
  default: {
    name: 'PromptVariableInput',
    props: ['variable', 'modelValue'],
    emits: ['update:modelValue'],
    template:
      '<div data-testid="variable-input">' +
      '<span data-testid="variable-name">{{ variable.name }}</span>' +
      '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />' +
      '</div>',
  },
}));

vi.mock('@/components/playground/PromptOutput.vue', () => ({
  default: {
    name: 'PromptOutput',
    props: ['output', 'isRunning', 'error'],
    template:
      '<div data-testid="prompt-output">' +
      '<span data-testid="output-text">{{ output }}</span>' +
      '</div>',
  },
}));

import PlaygroundPage from '@/pages/PlaygroundPage.vue';

function createTestRouter(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: { template: '<div>Home</div>' } },
      {
        path: '/playground/:id',
        name: 'playground',
        component: PlaygroundPage,
      },
    ],
  });
}

function createMockVariable(overrides: Partial<PromptVariable> = {}): PromptVariable {
  return {
    id: 'var-1',
    postId: 'test-post-id',
    name: 'topic',
    placeholder: 'Enter topic',
    defaultValue: null,
    sortOrder: 0,
    ...overrides,
  };
}

describe('PlaygroundPage', () => {
  let pinia: Pinia;
  let router: Router;

  beforeEach(() => {
    pinia = createPinia();
    setActivePinia(pinia);
    router = createTestRouter();

    mockFetchVariables.mockReset();
    mockRun.mockReset();
    mockStop.mockReset();
    mockApiFetch.mockReset();
    mockVariables.value = [];
    mockIsRunning.value = false;
    mockError.value = null;
    mockOutput.value = '';

    // Default: apiFetch returns a successful post response
    mockApiFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ title: 'My Prompt' }),
    });
  });

  async function mountPage(postId = 'test-post-id') {
    router.push(`/playground/${postId}`);
    await router.isReady();

    return mount(PlaygroundPage, {
      global: {
        plugins: [pinia, router],
      },
    });
  }

  describe('on mount', () => {
    it('should fetch the post title using postId from route params', async () => {
      const wrapper = await mountPage('abc-123');
      await flushPromises();

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/abc-123');
      expect(wrapper.find('[data-testid="header-title"]').text()).toBe('My Prompt');
    });

    it('should call fetchVariables with postId on mount', async () => {
      await mountPage('abc-123');
      await flushPromises();

      expect(mockFetchVariables).toHaveBeenCalledWith('abc-123');
    });

    it('should use default title "Playground" before post fetches', async () => {
      // Make apiFetch hang so the title never updates
      mockApiFetch.mockReturnValue(new Promise(() => {}));

      const wrapper = await mountPage();
      // Don't flush — the fetch is still pending
      await nextTick();

      expect(wrapper.find('[data-testid="header-title"]').text()).toBe('Playground');
    });

    it('should keep default title when apiFetch returns not ok', async () => {
      mockApiFetch.mockResolvedValue({
        ok: false,
        json: async () => ({}),
      });

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="header-title"]').text()).toBe('Playground');
    });
  });

  describe('rendering PlaygroundHeader', () => {
    it('should render PlaygroundHeader with correct title', async () => {
      const wrapper = await mountPage();
      await flushPromises();

      const header = wrapper.find('[data-testid="playground-header"]');
      expect(header.exists()).toBe(true);
      expect(wrapper.find('[data-testid="header-title"]').text()).toBe('My Prompt');
    });
  });

  describe('variable inputs', () => {
    it('should render PromptVariableInput for each variable', async () => {
      const wrapper = await mountPage();
      await flushPromises();

      mockVariables.value = [
        createMockVariable({ id: 'v1', name: 'topic' }),
        createMockVariable({ id: 'v2', name: 'tone' }),
      ];
      await nextTick();

      const inputs = wrapper.findAll('[data-testid="variable-input"]');
      expect(inputs).toHaveLength(2);
      expect(wrapper.findAll('[data-testid="variable-name"]').map((el) => el.text())).toEqual([
        'topic',
        'tone',
      ]);
    });

    it('should show empty state when no variables exist', async () => {
      mockVariables.value = [];

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.text()).toContain('No variables found in this prompt.');
    });

    it('should pre-fill default values from variable.defaultValue', async () => {
      const wrapper = await mountPage();
      await flushPromises();

      mockVariables.value = [
        createMockVariable({ id: 'v1', name: 'topic', defaultValue: 'AI' }),
        createMockVariable({ id: 'v2', name: 'tone', defaultValue: 'formal' }),
      ];
      await nextTick();
      // The watch needs a tick to fire
      await nextTick();

      const inputs = wrapper.findAll('[data-testid="variable-input"] input');
      expect(inputs).toHaveLength(2);
      const firstInput = inputs[0] as ReturnType<typeof wrapper.find>;
      const secondInput = inputs[1] as ReturnType<typeof wrapper.find>;
      expect((firstInput.element as HTMLInputElement).value).toBe('AI');
      expect((secondInput.element as HTMLInputElement).value).toBe('formal');
    });

    it('should use empty string when defaultValue is null', async () => {
      const wrapper = await mountPage();
      await flushPromises();

      mockVariables.value = [createMockVariable({ id: 'v1', name: 'topic', defaultValue: null })];
      await nextTick();
      await nextTick();

      const input = wrapper.find('[data-testid="variable-input"] input');
      expect((input.element as HTMLInputElement).value).toBe('');
    });

    it('should not overwrite existing variable value when variables re-emit', async () => {
      const wrapper = await mountPage();
      await flushPromises();

      // Set initial variables
      mockVariables.value = [createMockVariable({ id: 'v1', name: 'topic', defaultValue: 'AI' })];
      await nextTick();
      await nextTick();

      // Simulate user typing a new value
      const input = wrapper.find('[data-testid="variable-input"] input');
      await input.setValue('Machine Learning');

      // Trigger the watch again by updating variables (e.g., re-fetch)
      mockVariables.value = [createMockVariable({ id: 'v1', name: 'topic', defaultValue: 'AI' })];
      await nextTick();
      await nextTick();

      // The user's value should be preserved, not overwritten
      expect((input.element as HTMLInputElement).value).toBe('Machine Learning');
    });
  });

  describe('run action', () => {
    it('should call run with postId and current variable values when Run button is clicked', async () => {
      const wrapper = await mountPage('test-post-id');
      await flushPromises();

      mockVariables.value = [createMockVariable({ id: 'v1', name: 'topic', defaultValue: 'AI' })];
      await nextTick();
      await nextTick();

      await wrapper.find('[data-testid="run-btn"]').trigger('click');

      expect(mockRun).toHaveBeenCalledWith('test-post-id', { topic: 'AI' });
    });
  });

  describe('stop action', () => {
    it('should call stop when Stop button is clicked', async () => {
      const wrapper = await mountPage();
      await flushPromises();

      await wrapper.find('[data-testid="stop-btn"]').trigger('click');

      expect(mockStop).toHaveBeenCalled();
    });
  });

  describe('output panel', () => {
    it('should render PromptOutput component', async () => {
      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="prompt-output"]').exists()).toBe(true);
    });

    it('should pass streaming output to PromptOutput', async () => {
      mockOutput.value = 'Hello, streaming world!';

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="output-text"]').text()).toBe('Hello, streaming world!');
    });
  });
});
