import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { ref, nextTick } from 'vue';
import type { EditorView } from '@codemirror/view';
import type { AiGenerateRequest } from '@forge/shared';

// --- Mock useAiGenerate composable ---
const mockIsGenerating = ref(false);
const mockError = ref<string | null>(null);
const mockStart = vi.fn();
const mockStop = vi.fn();

vi.mock('@/composables/useAiGenerate', () => ({
  useAiGenerate: () => ({
    isGenerating: mockIsGenerating,
    error: mockError,
    start: mockStart,
    stop: mockStop,
  }),
}));

import AiGeneratePanel from '@/components/editor/AiGeneratePanel.vue';

function makeStubEditorView(cursorPos = 0): EditorView {
  return {
    state: { selection: { main: { head: cursorPos } } },
    dispatch: vi.fn(),
  } as unknown as EditorView;
}

describe('AiGeneratePanel', () => {
  let wrapper: VueWrapper;
  let editorView: EditorView;

  const defaultProps = {
    editorView: null as unknown as EditorView,
    contentType: 'snippet' as AiGenerateRequest['contentType'],
    language: 'typescript',
  };

  beforeEach(() => {
    mockIsGenerating.value = false;
    mockError.value = null;
    mockStart.mockReset();
    mockStop.mockReset();
    editorView = makeStubEditorView(10);
    defaultProps.editorView = editorView;
  });

  // --- Test 1: Renders collapsed toggle button by default ---
  it('renders the collapsed toggle button by default', () => {
    wrapper = mount(AiGeneratePanel, { props: { ...defaultProps } });

    const toggle = wrapper.find('[data-testid="ai-generate-toggle"]');
    expect(toggle.exists()).toBe(true);
    expect(toggle.text()).toContain('Generate with AI');

    // Textarea, Generate, Stop buttons should NOT be present
    expect(wrapper.find('[data-testid="ai-generate-description"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-generate-submit"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-generate-stop"]').exists()).toBe(false);
  });

  // --- Test 2: Click toggle → shows textarea + Generate button ---
  it('click toggle switches to expanded state with textarea and Generate button', async () => {
    wrapper = mount(AiGeneratePanel, { props: { ...defaultProps } });

    const toggle = wrapper.find('[data-testid="ai-generate-toggle"]');
    await toggle.trigger('click');

    expect(wrapper.find('[data-testid="ai-generate-description"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-generate-submit"]').exists()).toBe(true);
  });

  // --- Test 3: Generate button disabled when description empty ---
  it('Generate button is disabled when description is empty', async () => {
    wrapper = mount(AiGeneratePanel, { props: { ...defaultProps } });

    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');

    const submitBtn = wrapper.find('[data-testid="ai-generate-submit"]');
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(true);
  });

  // --- Test 4: Click Generate with description → calls useAiGenerate.start ---
  it('click Generate with description calls useAiGenerate.start with correct payload', async () => {
    wrapper = mount(AiGeneratePanel, { props: { ...defaultProps } });

    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');

    const textarea = wrapper.find('[data-testid="ai-generate-description"]');
    await textarea.setValue('a fibonacci function');

    mockStart.mockResolvedValue(undefined);

    const submitBtn = wrapper.find('[data-testid="ai-generate-submit"]');
    await submitBtn.trigger('click');
    await nextTick();

    expect(mockStart).toHaveBeenCalledOnce();
    const callArgs = mockStart.mock.calls[0];
    expect(callArgs?.[0]).toEqual({
      description: 'a fibonacci function',
      contentType: 'snippet',
      language: 'typescript',
    });
    // Second arg is onToken callback
    expect(typeof callArgs?.[1]).toBe('function');
  });

  // --- Test 5: Tokens arriving → editorView.dispatch called with correct changes ---
  it('tokens arriving dispatches insert at current cursor position', async () => {
    wrapper = mount(AiGeneratePanel, { props: { ...defaultProps } });

    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');
    await wrapper.find('[data-testid="ai-generate-description"]').setValue('test');

    // When start is called, capture the onToken callback and invoke it synchronously
    mockStart.mockImplementation((_req: unknown, onToken: (text: string) => void) => {
      mockIsGenerating.value = true;
      onToken('hello');
      return Promise.resolve();
    });

    await wrapper.find('[data-testid="ai-generate-submit"]').trigger('click');
    await nextTick();

    const dispatch = editorView.dispatch as Mock;
    expect(dispatch).toHaveBeenCalledWith({
      changes: { from: 10, insert: 'hello' },
      selection: { anchor: 15 },
      scrollIntoView: true,
    });
  });

  // --- Test 6: Stop button visible only in generating state ---
  it('Stop button is visible only in generating state', async () => {
    wrapper = mount(AiGeneratePanel, { props: { ...defaultProps } });

    // Collapsed — no stop button
    expect(wrapper.find('[data-testid="ai-generate-stop"]').exists()).toBe(false);

    // Expanded — no stop button
    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="ai-generate-stop"]').exists()).toBe(false);

    // Generating — stop button visible
    mockStart.mockImplementation(() => {
      mockIsGenerating.value = true;
      return new Promise(() => {
        // Never resolves — simulates in-progress generation
      });
    });
    await wrapper.find('[data-testid="ai-generate-description"]').setValue('test');
    await wrapper.find('[data-testid="ai-generate-submit"]').trigger('click');
    await nextTick();

    expect(wrapper.find('[data-testid="ai-generate-stop"]').exists()).toBe(true);
  });

  // --- Test 7: Stop button → calls useAiGenerate.stop ---
  it('Stop button calls useAiGenerate.stop', async () => {
    wrapper = mount(AiGeneratePanel, { props: { ...defaultProps } });

    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');
    await wrapper.find('[data-testid="ai-generate-description"]').setValue('test');

    mockStart.mockImplementation(() => {
      mockIsGenerating.value = true;
      return new Promise(() => {});
    });

    await wrapper.find('[data-testid="ai-generate-submit"]').trigger('click');
    await nextTick();

    const stopBtn = wrapper.find('[data-testid="ai-generate-stop"]');
    await stopBtn.trigger('click');

    expect(mockStop).toHaveBeenCalledOnce();
  });

  // --- Test 8: After done → auto-collapses ---
  it('auto-collapses after generation completes successfully', async () => {
    wrapper = mount(AiGeneratePanel, { props: { ...defaultProps } });

    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');
    await wrapper.find('[data-testid="ai-generate-description"]').setValue('test');

    mockStart.mockImplementation(() => {
      mockIsGenerating.value = true;
      return Promise.resolve();
    });

    await wrapper.find('[data-testid="ai-generate-submit"]').trigger('click');
    await nextTick();

    // Simulate generation completing: isGenerating goes false, no error
    mockIsGenerating.value = false;
    await nextTick();

    // Should be back to collapsed state
    expect(wrapper.find('[data-testid="ai-generate-toggle"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-generate-description"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="ai-generate-stop"]').exists()).toBe(false);
  });

  // --- Test 9: After error → stays expanded, shows error text ---
  it('stays expanded and shows error text after generation fails', async () => {
    wrapper = mount(AiGeneratePanel, { props: { ...defaultProps } });

    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');
    await wrapper.find('[data-testid="ai-generate-description"]').setValue('test');

    mockStart.mockImplementation(() => {
      mockIsGenerating.value = true;
      return Promise.resolve();
    });

    await wrapper.find('[data-testid="ai-generate-submit"]').trigger('click');
    await nextTick();

    // Simulate error: isGenerating goes false, error is set
    mockError.value = 'Generation failed: model unavailable';
    mockIsGenerating.value = false;
    await nextTick();

    // Should stay in expanded state with textarea visible
    expect(wrapper.find('[data-testid="ai-generate-description"]').exists()).toBe(true);
    // Error text should be displayed
    expect(wrapper.text()).toContain('Generation failed: model unavailable');
    // Should NOT have auto-collapsed — stop button gone, but textarea still present
    expect(wrapper.find('[data-testid="ai-generate-stop"]').exists()).toBe(false);
  });

  // --- Test 10: Clicking Cancel/toggle during expanded+error → collapses + clears error ---
  it('clicking Cancel during expanded error state returns to collapsed and clears error', async () => {
    wrapper = mount(AiGeneratePanel, { props: { ...defaultProps } });

    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');
    await wrapper.find('[data-testid="ai-generate-description"]').setValue('test');

    mockStart.mockImplementation(() => {
      mockIsGenerating.value = true;
      return Promise.resolve();
    });

    await wrapper.find('[data-testid="ai-generate-submit"]').trigger('click');
    await nextTick();

    // Simulate error
    mockError.value = 'Something went wrong';
    mockIsGenerating.value = false;
    await nextTick();

    // Error should be visible
    expect(wrapper.text()).toContain('Something went wrong');

    // Find and click the Cancel button
    const cancelBtn = wrapper.find('[data-testid="ai-generate-cancel"]');
    expect(cancelBtn.exists()).toBe(true);
    await cancelBtn.trigger('click');

    // Should be back to collapsed state
    expect(wrapper.find('[data-testid="ai-generate-toggle"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="ai-generate-description"]').exists()).toBe(false);
  });

  // --- Test 11: Toggle click during generating state is a no-op ---
  it('toggle click during generating state is a no-op', async () => {
    wrapper = mount(AiGeneratePanel, { props: { ...defaultProps } });

    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');
    await wrapper.find('[data-testid="ai-generate-description"]').setValue('test');

    mockStart.mockImplementation(() => {
      mockIsGenerating.value = true;
      return new Promise(() => {});
    });

    await wrapper.find('[data-testid="ai-generate-submit"]').trigger('click');
    await nextTick();

    // In generating state — toggle should not be visible
    expect(wrapper.find('[data-testid="ai-generate-toggle"]').exists()).toBe(false);
    // Stop button should be visible
    expect(wrapper.find('[data-testid="ai-generate-stop"]').exists()).toBe(true);
  });

  // --- Test 12: Clicking toggle in expanded clears previous error ---
  it('clicking toggle to expand clears previous error', async () => {
    wrapper = mount(AiGeneratePanel, { props: { ...defaultProps } });

    // Set an error from a previous attempt
    mockError.value = 'Previous error';

    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');

    // Error should have been cleared
    expect(mockError.value).toBeNull();
  });

  // --- Test 13: Toggle in expanded state collapses back ---
  it('clicking toggle in expanded state collapses back to collapsed', async () => {
    wrapper = mount(AiGeneratePanel, { props: { ...defaultProps } });

    // Expand
    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="ai-generate-description"]').exists()).toBe(true);

    // Click toggle again to collapse
    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');
    expect(wrapper.find('[data-testid="ai-generate-description"]').exists()).toBe(false);
  });

  // --- Test 14: onGenerate is a no-op when description is empty ---
  it('onGenerate does not call start when description is empty', async () => {
    wrapper = mount(AiGeneratePanel, { props: { ...defaultProps } });

    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');

    // Description is empty — simulate clicking the submit button directly
    // Even though the button is disabled in the DOM, we test the guard
    const submitBtn = wrapper.find('[data-testid="ai-generate-submit"]');
    // Force trigger click on the element (bypasses disabled attribute for coverage)
    await submitBtn.element.dispatchEvent(new Event('click'));
    await nextTick();

    expect(mockStart).not.toHaveBeenCalled();
  });

  // --- Test 15: Clicking toggle during error clears error and collapses ---
  it('clicking toggle during expanded error state clears error and collapses', async () => {
    wrapper = mount(AiGeneratePanel, { props: { ...defaultProps } });

    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');
    await wrapper.find('[data-testid="ai-generate-description"]').setValue('test');

    mockStart.mockImplementation(() => {
      mockIsGenerating.value = true;
      return Promise.resolve();
    });

    await wrapper.find('[data-testid="ai-generate-submit"]').trigger('click');
    await nextTick();

    // Simulate error
    mockError.value = 'Something failed';
    mockIsGenerating.value = false;
    await nextTick();

    // Should show error
    expect(wrapper.text()).toContain('Something failed');

    // Click toggle to collapse and clear error
    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');

    expect(wrapper.find('[data-testid="ai-generate-description"]').exists()).toBe(false);
    expect(mockError.value).toBeNull();
  });

  // --- Test 16: Multiple tokens advance cursor correctly ---
  it('multiple tokens re-read cursor and advance correctly', async () => {
    // Start cursor at 10, after first token it should be at 15 (10 + 5 = "hello")
    const view = makeStubEditorView(10);
    wrapper = mount(AiGeneratePanel, {
      props: { ...defaultProps, editorView: view },
    });

    await wrapper.find('[data-testid="ai-generate-toggle"]').trigger('click');
    await wrapper.find('[data-testid="ai-generate-description"]').setValue('test');

    mockStart.mockImplementation((_req: unknown, onToken: (text: string) => void) => {
      mockIsGenerating.value = true;
      onToken('hello');
      // Simulate cursor advancement by changing the stub state
      (view.state as { selection: { main: { head: number } } }).selection.main.head = 15;
      onToken(' world');
      return Promise.resolve();
    });

    await wrapper.find('[data-testid="ai-generate-submit"]').trigger('click');
    await nextTick();

    const dispatch = view.dispatch as Mock;
    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(dispatch.mock.calls[0]?.[0]).toEqual({
      changes: { from: 10, insert: 'hello' },
      selection: { anchor: 15 },
      scrollIntoView: true,
    });
    expect(dispatch.mock.calls[1]?.[0]).toEqual({
      changes: { from: 15, insert: ' world' },
      selection: { anchor: 21 },
      scrollIntoView: true,
    });
  });
});
