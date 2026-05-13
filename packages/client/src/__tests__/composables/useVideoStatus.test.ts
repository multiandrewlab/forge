import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount, flushPromises } from '@vue/test-utils';
import type { ServerMessage } from '@forge/shared';

// ── Mock useWebSocket ──────────────────────────────────────────────────
// useWebSocket exposes subscribe(channel, handler) → unsubscribe fn.
// We record both the channel and the handler so individual tests can drive
// arbitrary server messages and assert subscribe/unsubscribe lifecycle.

type Handler = (msg: ServerMessage) => void;

const subscribeCalls: { channel: string; handler: Handler }[] = [];
const unsubscribeMock = vi.fn();

vi.mock('../../composables/useWebSocket.js', () => ({
  useWebSocket: () => ({
    subscribe: (channel: string, handler: Handler) => {
      subscribeCalls.push({ channel, handler });
      return unsubscribeMock;
    },
  }),
}));

// Dynamic import after the mock is registered.
const { useVideoStatus } = await import('../../composables/useVideoStatus.js');

// When refs are returned from setup(), Vue auto-unwraps them on the proxy
// instance (vm). So the test reads `vm.status` (already the inner value)
// rather than `vm.status.value`.
interface VideoStatusComposableExposed {
  status: string | null;
  progress: number | null;
  suggestions: {
    runId: string;
    title: string;
    description: string;
    tags: string[];
    createdAt: string;
  } | null;
  error: string | null;
  pendingCfUid: string | null;
}

function withComposable(fn: () => unknown) {
  const Comp = defineComponent({
    setup() {
      return fn() as Record<string, unknown>;
    },
    render() {
      return h('div');
    },
  });
  return mount(Comp);
}

function broadcast(msg: ServerMessage): void {
  // Dispatch through every recorded subscriber whose channel matches the msg.
  for (const sub of subscribeCalls) {
    if ('channel' in msg && msg.channel === sub.channel) {
      sub.handler(msg);
    }
  }
}

describe('useVideoStatus', () => {
  beforeEach(() => {
    subscribeCalls.length = 0;
    unsubscribeMock.mockClear();
  });

  it('initial state — all refs are null', () => {
    const w = withComposable(() => useVideoStatus('p1'));
    const vm = w.vm as unknown as VideoStatusComposableExposed;
    expect(vm.status).toBeNull();
    expect(vm.progress).toBeNull();
    expect(vm.suggestions).toBeNull();
    expect(vm.error).toBeNull();
    expect(vm.pendingCfUid).toBeNull();
  });

  it('subscribes to post:<postId>:owner channel on mount', () => {
    withComposable(() => useVideoStatus('p1'));
    expect(subscribeCalls.length).toBeGreaterThanOrEqual(1);
    expect(subscribeCalls[0]?.channel).toBe('post:p1:owner');
  });

  it('updates status on video:status event for the matching postId', async () => {
    const w = withComposable(() => useVideoStatus('p1'));
    broadcast({
      type: 'video:status',
      channel: 'post:p1:owner',
      postId: 'p1',
      status: 'processing',
    } as unknown as ServerMessage);
    await flushPromises();
    const vm = w.vm as unknown as VideoStatusComposableExposed;
    expect(vm.status).toBe('processing');
  });

  it('ignores video:status events for a different postId', async () => {
    const w = withComposable(() => useVideoStatus('p1'));
    broadcast({
      type: 'video:status',
      channel: 'post:p1:owner',
      postId: 'p2',
      status: 'processing',
    } as unknown as ServerMessage);
    await flushPromises();
    const vm = w.vm as unknown as VideoStatusComposableExposed;
    expect(vm.status).toBeNull();
  });

  it('updates error from lastError on video:status', async () => {
    const w = withComposable(() => useVideoStatus('p1'));
    broadcast({
      type: 'video:status',
      channel: 'post:p1:owner',
      postId: 'p1',
      status: 'failed',
      lastError: 'transcode failed',
    } as unknown as ServerMessage);
    await flushPromises();
    const vm = w.vm as unknown as VideoStatusComposableExposed;
    expect(vm.status).toBe('failed');
    expect(vm.error).toBe('transcode failed');
  });

  it('clears error when subsequent video:status has no lastError', async () => {
    const w = withComposable(() => useVideoStatus('p1'));
    broadcast({
      type: 'video:status',
      channel: 'post:p1:owner',
      postId: 'p1',
      status: 'failed',
      lastError: 'transcode failed',
    } as unknown as ServerMessage);
    await flushPromises();
    broadcast({
      type: 'video:status',
      channel: 'post:p1:owner',
      postId: 'p1',
      status: 'processing',
    } as unknown as ServerMessage);
    await flushPromises();
    const vm = w.vm as unknown as VideoStatusComposableExposed;
    expect(vm.error).toBeNull();
  });

  it('exposes pendingCfUid when status carries it', async () => {
    const w = withComposable(() => useVideoStatus('p1'));
    broadcast({
      type: 'video:status',
      channel: 'post:p1:owner',
      postId: 'p1',
      status: 'ready',
      pendingCfUid: 'cfnew',
    } as unknown as ServerMessage);
    await flushPromises();
    const vm = w.vm as unknown as VideoStatusComposableExposed;
    expect(vm.pendingCfUid).toBe('cfnew');
  });

  it('clears pendingCfUid when a subsequent status omits it', async () => {
    const w = withComposable(() => useVideoStatus('p1'));
    broadcast({
      type: 'video:status',
      channel: 'post:p1:owner',
      postId: 'p1',
      status: 'ready',
      pendingCfUid: 'cfnew',
    } as unknown as ServerMessage);
    await flushPromises();
    broadcast({
      type: 'video:status',
      channel: 'post:p1:owner',
      postId: 'p1',
      status: 'ready',
    } as unknown as ServerMessage);
    await flushPromises();
    const vm = w.vm as unknown as VideoStatusComposableExposed;
    expect(vm.pendingCfUid).toBeNull();
  });

  it('updates suggestions on video:ai-suggestion-ready for matching postId', async () => {
    const w = withComposable(() => useVideoStatus('p1'));
    broadcast({
      type: 'video:ai-suggestion-ready',
      channel: 'post:p1:owner',
      postId: 'p1',
      runId: 'r1',
      title: 'My Title',
      description: 'My Description',
      tags: ['vue', 'video'],
      createdAt: '2026-05-13T00:00:00Z',
    } as unknown as ServerMessage);
    await flushPromises();
    const vm = w.vm as unknown as VideoStatusComposableExposed;
    expect(vm.suggestions?.title).toBe('My Title');
    expect(vm.suggestions?.description).toBe('My Description');
    expect(vm.suggestions?.tags).toEqual(['vue', 'video']);
    expect(vm.suggestions?.runId).toBe('r1');
  });

  it('ignores video:ai-suggestion-ready for a different postId', async () => {
    const w = withComposable(() => useVideoStatus('p1'));
    broadcast({
      type: 'video:ai-suggestion-ready',
      channel: 'post:p1:owner',
      postId: 'p2',
      runId: 'r1',
      title: 'X',
      description: 'Y',
      tags: [],
      createdAt: '2026-05-13T00:00:00Z',
    } as unknown as ServerMessage);
    await flushPromises();
    const vm = w.vm as unknown as VideoStatusComposableExposed;
    expect(vm.suggestions).toBeNull();
  });

  it('ignores unknown message types on the owner channel', async () => {
    const w = withComposable(() => useVideoStatus('p1'));
    broadcast({
      type: 'comment:new',
      channel: 'post:p1:owner',
      data: {
        id: 'c1',
        postId: 'p1',
        author: null,
        parentId: null,
        lineNumber: null,
        revisionId: null,
        revisionNumber: null,
        body: 'hi',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
    } as ServerMessage);
    await flushPromises();
    const vm = w.vm as unknown as VideoStatusComposableExposed;
    expect(vm.status).toBeNull();
    expect(vm.suggestions).toBeNull();
  });

  it('calls unsubscribe when the component unmounts', () => {
    const w = withComposable(() => useVideoStatus('p1'));
    expect(unsubscribeMock).not.toHaveBeenCalled();
    w.unmount();
    expect(unsubscribeMock).toHaveBeenCalled();
  });
});
