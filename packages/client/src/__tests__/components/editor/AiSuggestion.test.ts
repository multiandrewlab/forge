import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, type VueWrapper } from '@vue/test-utils';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { ghostTextExtension, currentGhostText } from '../../../lib/ai/ghost-text.js';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function sseStreamOf(frames: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const f of frames) ctrl.enqueue(enc.encode(f));
      ctrl.close();
    },
  });
  return new Response(body, { headers: { 'content-type': 'text/event-stream' } });
}

function makeView(doc = 'const x = '): EditorView {
  const view = new EditorView({
    state: EditorState.create({ doc, extensions: ghostTextExtension }),
    parent: document.createElement('div'),
  });
  view.dispatch({ selection: { anchor: doc.length } });
  return view;
}

// Dynamic import so the stubGlobal for fetch is in place before module loads
const { default: AiSuggestion } = await import('../../../components/editor/AiSuggestion.vue');

describe('AiSuggestion', () => {
  let view: EditorView;
  let wrapper: VueWrapper;

  beforeEach(() => {
    vi.useFakeTimers();
    mockFetch.mockReset();
    view = makeView();
  });

  afterEach(() => {
    wrapper?.unmount();
    view?.destroy();
    vi.useRealTimers();
  });

  it('mounts with editor-view prop', () => {
    wrapper = mount(AiSuggestion, { props: { editorView: view } });
    expect(wrapper.find('span').exists()).toBe(true);
    expect(wrapper.find('span').attributes('style')).toContain('display: none');
  });

  it('updates ghost text when suggestion arrives', async () => {
    mockFetch.mockResolvedValue(
      sseStreamOf(['event: token\ndata: {"text":"42;"}\n\n', 'event: done\ndata: {}\n\n']),
    );

    wrapper = mount(AiSuggestion, { props: { editorView: view } });
    const exposed = wrapper.vm as unknown as {
      requestCompletion: (input: { before: string; after: string; language: string }) => void;
    };
    exposed.requestCompletion({ before: 'const x = ', after: '', language: 'js' });

    // Advance past debounce
    await vi.advanceTimersByTimeAsync(300);
    // Drain the SSE stream
    await vi.runAllTimersAsync();

    expect(currentGhostText(view.state)).toBe('42;');
  });

  it('Tab key accepts the suggestion', async () => {
    mockFetch.mockResolvedValue(
      sseStreamOf(['event: token\ndata: {"text":"42;"}\n\n', 'event: done\ndata: {}\n\n']),
    );

    wrapper = mount(AiSuggestion, { props: { editorView: view } });
    const exposed = wrapper.vm as unknown as {
      requestCompletion: (input: { before: string; after: string; language: string }) => void;
    };
    exposed.requestCompletion({ before: 'const x = ', after: '', language: 'js' });

    await vi.advanceTimersByTimeAsync(300);
    await vi.runAllTimersAsync();

    // Ghost text should be present
    expect(currentGhostText(view.state)).toBe('42;');

    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    view.contentDOM.dispatchEvent(tabEvent);

    expect(tabEvent.defaultPrevented).toBe(true);
    // Ghost text cleared after accept; text inserted into doc
    expect(view.state.doc.toString()).toBe('const x = 42;');
    expect(currentGhostText(view.state)).toBeNull();
  });

  it('any other keystroke dismisses the suggestion', async () => {
    mockFetch.mockResolvedValue(
      sseStreamOf(['event: token\ndata: {"text":"42;"}\n\n', 'event: done\ndata: {}\n\n']),
    );

    wrapper = mount(AiSuggestion, { props: { editorView: view } });
    const exposed = wrapper.vm as unknown as {
      requestCompletion: (input: { before: string; after: string; language: string }) => void;
    };
    exposed.requestCompletion({ before: 'const x = ', after: '', language: 'js' });

    await vi.advanceTimersByTimeAsync(300);
    await vi.runAllTimersAsync();

    // Ghost text should be present
    expect(currentGhostText(view.state)).toBe('42;');

    // Dispatch a non-Tab key
    const escEvent = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    view.contentDOM.dispatchEvent(escEvent);

    // The suggestion ref inside useAiComplete should be cleared which triggers
    // the watcher to dispatch setGhostText.of(null)
    // Allow the watcher to run
    await vi.runAllTimersAsync();

    // The doc should NOT have the suggestion inserted
    expect(view.state.doc.toString()).toBe('const x = ');
  });

  it('does nothing on Tab when no suggestion present', () => {
    wrapper = mount(AiSuggestion, { props: { editorView: view } });

    // No suggestion active
    expect(currentGhostText(view.state)).toBeNull();

    const tabEvent = new KeyboardEvent('keydown', {
      key: 'Tab',
      bubbles: true,
      cancelable: true,
    });
    view.contentDOM.dispatchEvent(tabEvent);

    // Tab not prevented (browser default should happen)
    expect(tabEvent.defaultPrevented).toBe(false);
    // Doc unchanged
    expect(view.state.doc.toString()).toBe('const x = ');
  });
});
