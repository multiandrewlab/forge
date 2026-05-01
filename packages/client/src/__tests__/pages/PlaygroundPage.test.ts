import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createRouter, createMemoryHistory } from 'vue-router';
import { setActivePinia, createPinia } from 'pinia';
import { ref, computed, nextTick } from 'vue';
import type { Router } from 'vue-router';
import type { Pinia } from 'pinia';
import type { Ref } from 'vue';
import type { PromptVariable, ContentType } from '@forge/shared';

// --- Mock usePlayground composable ---
const mockFetchVariables = vi.fn();
const mockFetchPost = vi.fn();
const mockRun = vi.fn();
const mockStop = vi.fn();
const mockVariables: Ref<PromptVariable[]> = ref([]);
const mockIsRunning = ref(false);
const mockError: Ref<string | null> = ref(null);
const mockOutput = ref('');
const mockLoadError: Ref<string | null> = ref(null);
const mockMissingVariables: Ref<string[]> = ref([]);
const mockInputValues = ref<Record<string, string>>({});
type CurrentPost = {
  id: string;
  title: string;
  contentType: ContentType;
  content: string;
} | null;
const mockCurrentPost: Ref<CurrentPost> = ref(null);
const mockCanRunRaw = ref(true);

vi.mock('@/composables/usePlayground', () => ({
  usePlayground: () => ({
    variables: mockVariables,
    isRunning: mockIsRunning,
    error: mockError,
    output: mockOutput,
    currentPost: mockCurrentPost,
    loadError: mockLoadError,
    missingVariables: mockMissingVariables,
    inputValues: mockInputValues,
    requiredVariables: computed(() => []),
    canRun: computed(() => mockCanRunRaw.value),
    fetchVariables: mockFetchVariables,
    fetchPost: mockFetchPost,
    run: mockRun,
    stop: mockStop,
  }),
}));

// --- Mock child components ---
vi.mock('@/components/playground/PlaygroundHeader.vue', () => ({
  default: {
    name: 'PlaygroundHeader',
    props: ['title', 'isRunning', 'canRun', 'sourcePostId', 'contentType'],
    emits: ['run', 'stop'],
    template:
      '<div data-testid="playground-header">' +
      '<span data-testid="header-title">{{ title }}</span>' +
      '<span data-testid="header-content-type">{{ contentType }}</span>' +
      '<span data-testid="header-source-post-id">{{ sourcePostId }}</span>' +
      '<span data-testid="header-can-run">{{ String(canRun) }}</span>' +
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
      '<div data-testid="prompt-output-stub">' +
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
    mockFetchPost.mockReset();
    mockRun.mockReset();
    mockStop.mockReset();
    mockVariables.value = [];
    mockIsRunning.value = false;
    mockError.value = null;
    mockOutput.value = '';
    mockLoadError.value = null;
    mockMissingVariables.value = [];
    mockInputValues.value = {};
    mockCanRunRaw.value = true;
    mockCurrentPost.value = {
      id: 'test-post-id',
      title: 'My Prompt',
      contentType: 'prompt',
      content: 'Hello {{topic}}',
    };

    mockFetchPost.mockImplementation(async () => {
      // currentPost is already set in beforeEach for happy-path
    });
    mockFetchVariables.mockResolvedValue(undefined);
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
    it('should call fetchPost with postId from route params', async () => {
      await mountPage('abc-123');
      await flushPromises();

      expect(mockFetchPost).toHaveBeenCalledWith('abc-123');
    });

    it('should render the post title from currentPost', async () => {
      mockCurrentPost.value = {
        id: 'abc-123',
        title: 'My Prompt',
        contentType: 'prompt',
        content: '',
      };
      const wrapper = await mountPage('abc-123');
      await flushPromises();

      expect(wrapper.find('[data-testid="header-title"]').text()).toBe('My Prompt');
    });

    it('should call fetchVariables with postId on mount', async () => {
      await mountPage('abc-123');
      await flushPromises();

      expect(mockFetchVariables).toHaveBeenCalledWith('abc-123');
    });

    it('should use default title "Playground" when currentPost is null', async () => {
      mockCurrentPost.value = null;

      const wrapper = await mountPage();
      await nextTick();

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

    it('should pass sourcePostId to PlaygroundHeader', async () => {
      const wrapper = await mountPage('post-42');
      await flushPromises();

      expect(wrapper.find('[data-testid="header-source-post-id"]').text()).toBe('post-42');
    });

    it('should pass contentType from currentPost to PlaygroundHeader', async () => {
      mockCurrentPost.value = {
        id: 't',
        title: 'T',
        contentType: 'snippet',
        content: '',
      };
      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="header-content-type"]').text()).toBe('snippet');
    });

    it('should default contentType to "prompt" when currentPost is null', async () => {
      mockCurrentPost.value = null;
      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="header-content-type"]').text()).toBe('prompt');
    });

    it('should pass canRun to PlaygroundHeader', async () => {
      mockCanRunRaw.value = false;
      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="header-can-run"]').text()).toBe('false');
    });
  });

  describe('error regions', () => {
    it('renders the load-error region when loadError is set', async () => {
      mockLoadError.value = 'Post not found';
      const wrapper = await mountPage();
      await flushPromises();

      const region = wrapper.find('[data-testid="playground-load-error"]');
      expect(region.exists()).toBe(true);
      expect(region.attributes('role')).toBe('alert');
      expect(region.text()).toContain('Post not found');
    });

    it('hides the load-error region when loadError is null', async () => {
      mockLoadError.value = null;
      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="playground-load-error"]').exists()).toBe(false);
    });

    it('renders the runtime error region when error is set', async () => {
      mockError.value = 'Generation failed';
      const wrapper = await mountPage();
      await flushPromises();

      const region = wrapper.find('[data-testid="playground-error"]');
      expect(region.exists()).toBe(true);
      expect(region.attributes('role')).toBe('alert');
      expect(region.text()).toContain('Generation failed');
    });

    it('hides the runtime error region when error is null', async () => {
      mockError.value = null;
      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="playground-error"]').exists()).toBe(false);
    });
  });

  describe('source disclosure', () => {
    it('renders the prompt source disclosure', async () => {
      mockCurrentPost.value = {
        id: 'abc',
        title: 'T',
        contentType: 'prompt',
        content: 'Hello {{topic}}',
      };
      const wrapper = await mountPage();
      await flushPromises();

      const details = wrapper.find('[data-testid="playground-prompt-source"]');
      expect(details.exists()).toBe(true);
      const content = wrapper.find('[data-testid="playground-prompt-content"]');
      expect(content.exists()).toBe(true);
      expect(content.text()).toContain('Hello {{topic}}');
    });

    it('renders empty content when currentPost is null', async () => {
      mockCurrentPost.value = null;
      const wrapper = await mountPage();
      await flushPromises();

      const content = wrapper.find('[data-testid="playground-prompt-content"]');
      expect(content.text()).toBe('');
    });
  });

  describe('run hint', () => {
    it('shows run hint when canRun is false and not running', async () => {
      mockCanRunRaw.value = false;
      mockIsRunning.value = false;
      const wrapper = await mountPage();
      await flushPromises();

      const hint = wrapper.find('#playground-run-hint');
      expect(hint.exists()).toBe(true);
      expect(hint.text()).toContain('Fill required variables to run');
    });

    it('hides run hint when canRun is true', async () => {
      mockCanRunRaw.value = true;
      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('#playground-run-hint').exists()).toBe(false);
    });

    it('hides run hint when running', async () => {
      mockCanRunRaw.value = false;
      mockIsRunning.value = true;
      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('#playground-run-hint').exists()).toBe(false);
    });
  });

  describe('page testid', () => {
    it('renders the playground-page testid wrapper', async () => {
      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="playground-page"]').exists()).toBe(true);
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

    it('should sync variable values into inputValues for canRun derivation', async () => {
      const wrapper = await mountPage();
      await flushPromises();

      mockVariables.value = [createMockVariable({ id: 'v1', name: 'topic', defaultValue: null })];
      await nextTick();
      await nextTick();

      const input = wrapper.find('[data-testid="variable-input"] input');
      await input.setValue('AI');

      expect(mockInputValues.value.topic).toBe('AI');
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

      expect(wrapper.find('[data-testid="prompt-output-stub"]').exists()).toBe(true);
    });

    it('should pass streaming output to PromptOutput', async () => {
      mockOutput.value = 'Hello, streaming world!';

      const wrapper = await mountPage();
      await flushPromises();

      expect(wrapper.find('[data-testid="output-text"]').text()).toBe('Hello, streaming world!');
    });
  });

  describe('getVarValue fallback', () => {
    it('returns empty string for unknown variable name', async () => {
      const wrapper = await mountPage();
      await flushPromises();

      const vm = wrapper.vm as unknown as { getVarValue: (name: string) => string };
      expect(vm.getVarValue('nonexistent')).toBe('');
    });
  });
});
