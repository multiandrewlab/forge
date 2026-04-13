import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import type {
  ServerMessage,
  CommentNewMessage,
  CommentUpdatedMessage,
  CommentDeletedMessage,
  VoteUpdatedMessage,
  RevisionNewMessage,
  PostNewMessage,
  PostUpdatedMessage,
  PresenceUpdateMessage,
} from '@forge/shared';

// ── FakeWebSocket ──────────────────────────────────────────────────────

type WSListener = (event: { data: string }) => void;
type WSEventListener = () => void;

class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;

  static instances: FakeWebSocket[] = [];

  url: string;
  readyState: number = FakeWebSocket.CONNECTING;
  onopen: WSEventListener | null = null;
  onclose: WSEventListener | null = null;
  onmessage: WSListener | null = null;
  onerror: WSEventListener | null = null;
  sent: string[] = [];

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = FakeWebSocket.CLOSED;
    // Do not auto-fire onclose here; tests fire it manually when needed
  }

  // Test helpers
  simulateOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    if (this.onopen) this.onopen();
  }

  simulateMessage(data: ServerMessage): void {
    if (this.onmessage) this.onmessage({ data: JSON.stringify(data) });
  }

  simulateClose(): void {
    this.readyState = FakeWebSocket.CLOSED;
    if (this.onclose) this.onclose();
  }

  simulateError(): void {
    if (this.onerror) this.onerror();
  }

  parseSent(): unknown[] {
    return this.sent.map((s) => JSON.parse(s) as unknown);
  }

  static reset(): void {
    FakeWebSocket.instances = [];
  }

  static latest(): FakeWebSocket {
    const inst = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
    if (!inst) throw new Error('No FakeWebSocket instances');
    return inst;
  }
}

// ── Module-level setup ─────────────────────────────────────────────────

vi.stubGlobal('WebSocket', FakeWebSocket);

// We need to reset module state between tests since useWebSocket uses module-scoped singletons.
// We dynamically import after each vi.resetModules().

let useWebSocket: typeof import('@/composables/useWebSocket').useWebSocket;
let useRealtimeStore: typeof import('@/stores/realtime').useRealtimeStore;

async function loadModules(): Promise<void> {
  vi.resetModules();
  const wsModule = await import('@/composables/useWebSocket');
  const storeModule = await import('@/stores/realtime');
  useWebSocket = wsModule.useWebSocket;
  useRealtimeStore = storeModule.useRealtimeStore;
}

describe('useWebSocket', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    FakeWebSocket.reset();
    setActivePinia(createPinia());
    await loadModules();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createTokenProvider(token = 'test-token'): () => Promise<string> {
    return vi.fn().mockResolvedValue(token);
  }

  // Helper: connect, open, auth:ok in one step
  async function connectAndAuth(
    tokenProvider?: () => Promise<string>,
  ): Promise<{ ws: FakeWebSocket; tokenProvider: () => Promise<string> }> {
    const tp = tokenProvider ?? createTokenProvider();
    const { connect } = useWebSocket();
    connect(tp);
    const ws = FakeWebSocket.latest();
    ws.simulateOpen();
    // flush the tokenProvider promise
    await vi.runAllTimersAsync();
    // auth message should have been sent
    ws.simulateMessage({ type: 'auth:ok' });
    return { ws, tokenProvider: tp };
  }

  describe('connect and auth flow', () => {
    it('should create a WebSocket and send auth message on open', async () => {
      const tokenProvider = createTokenProvider('my-jwt');
      const { connect } = useWebSocket();

      connect(tokenProvider);

      const ws = FakeWebSocket.latest();
      expect(ws.url).toContain('/ws');

      ws.simulateOpen();
      await vi.runAllTimersAsync();

      const sent = ws.parseSent();
      expect(sent).toHaveLength(1);
      expect(sent[0]).toEqual({ type: 'auth', token: 'my-jwt' });
    });

    it('should set status to connecting when connect is called', () => {
      const tokenProvider = createTokenProvider();
      const { connect, status } = useWebSocket();

      connect(tokenProvider);

      expect(status.value).toBe('connecting');
    });

    it('should set status to connected after auth:ok', async () => {
      const { connect, status } = useWebSocket();
      connect(createTokenProvider());

      const ws = FakeWebSocket.latest();
      ws.simulateOpen();
      await vi.runAllTimersAsync();

      ws.simulateMessage({ type: 'auth:ok' });

      expect(status.value).toBe('connected');
    });

    it('should use default WS_URL when VITE_WS_URL is not set', () => {
      const { connect } = useWebSocket();
      connect(createTokenProvider());

      const ws = FakeWebSocket.latest();
      // jsdom uses http://localhost, so protocol is ws: and host is localhost
      expect(ws.url).toMatch(/^ws:\/\//);
      expect(ws.url).toMatch(/\/ws$/);
    });
  });

  describe('clientId', () => {
    it('should expose a clientId string', () => {
      const { clientId } = useWebSocket();
      expect(typeof clientId).toBe('string');
      expect(clientId.length).toBeGreaterThan(0);
    });

    it('should return the same clientId on multiple calls', () => {
      const { clientId: id1 } = useWebSocket();
      const { clientId: id2 } = useWebSocket();
      expect(id1).toBe(id2);
    });
  });

  describe('subscribe', () => {
    it('should send subscribe frame when connected and handler receives channel messages', async () => {
      const { ws } = await connectAndAuth();
      const { subscribe } = useWebSocket();

      const handler = vi.fn();
      subscribe('post:123', handler);

      // subscribe frame sent
      const sent = ws.parseSent();
      const subscribeMsgs = sent.filter((m) => (m as Record<string, unknown>).type === 'subscribe');
      expect(subscribeMsgs).toHaveLength(1);
      expect(subscribeMsgs[0]).toEqual({ type: 'subscribe', channel: 'post:123' });

      // incoming message for the channel
      const msg: CommentNewMessage = {
        type: 'comment:new',
        channel: 'post:123',
        data: {
          id: 'c1',
          postId: '123',
          author: { id: 'u1', displayName: 'User', avatarUrl: null },
          parentId: null,
          lineNumber: null,
          revisionId: null,
          revisionNumber: null,
          body: 'Hello',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      };
      ws.simulateMessage(msg);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(msg);
    });

    it('should not send subscribe frame before connected', () => {
      const { connect, subscribe } = useWebSocket();
      connect(createTokenProvider());

      // Not yet open/authed
      const handler = vi.fn();
      subscribe('post:123', handler);

      const ws = FakeWebSocket.latest();
      // No subscribe sent yet (only after auth:ok via re-subscribe)
      const subscribeMsgs = ws
        .parseSent()
        .filter((m) => (m as Record<string, unknown>).type === 'subscribe');
      expect(subscribeMsgs).toHaveLength(0);
    });

    it('should route messages only to the correct channel handlers', async () => {
      const { ws } = await connectAndAuth();
      const { subscribe } = useWebSocket();

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      subscribe('post:123', handler1);
      subscribe('post:456', handler2);

      const msg: CommentNewMessage = {
        type: 'comment:new',
        channel: 'post:123',
        data: {
          id: 'c1',
          postId: '123',
          author: null,
          parentId: null,
          lineNumber: null,
          revisionId: null,
          revisionNumber: null,
          body: 'Hello',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      };
      ws.simulateMessage(msg);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should dispatch to multiple handlers on the same channel', async () => {
      const { ws } = await connectAndAuth();
      const { subscribe } = useWebSocket();

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      subscribe('post:123', handler1);
      subscribe('post:123', handler2);

      const msg: CommentNewMessage = {
        type: 'comment:new',
        channel: 'post:123',
        data: {
          id: 'c1',
          postId: '123',
          author: null,
          parentId: null,
          lineNumber: null,
          revisionId: null,
          revisionNumber: null,
          body: 'Hello',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      };
      ws.simulateMessage(msg);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('unsubscribe', () => {
    it('should remove handler and send unsubscribe frame when last handler removed', async () => {
      const { ws } = await connectAndAuth();
      const { subscribe } = useWebSocket();

      const handler = vi.fn();
      const cleanup = subscribe('post:123', handler);

      cleanup();

      const unsubMsgs = ws
        .parseSent()
        .filter((m) => (m as Record<string, unknown>).type === 'unsubscribe');
      expect(unsubMsgs).toHaveLength(1);
      expect(unsubMsgs[0]).toEqual({ type: 'unsubscribe', channel: 'post:123' });

      // Handler no longer called
      const msg: CommentNewMessage = {
        type: 'comment:new',
        channel: 'post:123',
        data: {
          id: 'c1',
          postId: '123',
          author: null,
          parentId: null,
          lineNumber: null,
          revisionId: null,
          revisionNumber: null,
          body: 'Hello',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      };
      ws.simulateMessage(msg);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should not send unsubscribe when other handlers remain on the channel', async () => {
      const { ws } = await connectAndAuth();
      const { subscribe } = useWebSocket();

      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const cleanup1 = subscribe('post:123', handler1);
      subscribe('post:123', handler2);

      cleanup1();

      const unsubMsgs = ws
        .parseSent()
        .filter((m) => (m as Record<string, unknown>).type === 'unsubscribe');
      expect(unsubMsgs).toHaveLength(0);
    });

    it('should be safe to call cleanup twice', async () => {
      await connectAndAuth();
      const { subscribe } = useWebSocket();

      const handler = vi.fn();
      const cleanup = subscribe('post:123', handler);

      cleanup();
      expect(() => cleanup()).not.toThrow();
    });

    it('should not send unsubscribe frame if socket is not connected', async () => {
      const { connect, subscribe } = useWebSocket();
      connect(createTokenProvider());

      const handler = vi.fn();
      const cleanup = subscribe('post:123', handler);

      cleanup();

      const ws = FakeWebSocket.latest();
      const unsubMsgs = ws
        .parseSent()
        .filter((m) => (m as Record<string, unknown>).type === 'unsubscribe');
      expect(unsubMsgs).toHaveLength(0);
    });
  });

  describe('send', () => {
    it('should send JSON when connected', async () => {
      const { ws } = await connectAndAuth();
      const { send } = useWebSocket();

      send({ type: 'presence', channel: 'post:123', status: 'viewing' });

      const presenceMsgs = ws
        .parseSent()
        .filter((m) => (m as Record<string, unknown>).type === 'presence');
      expect(presenceMsgs).toHaveLength(1);
      expect(presenceMsgs[0]).toEqual({
        type: 'presence',
        channel: 'post:123',
        status: 'viewing',
      });
    });

    it('should queue messages when not connected and flush after auth:ok', async () => {
      const { connect, send } = useWebSocket();
      const tokenProvider = createTokenProvider();
      connect(tokenProvider);

      // Send before open
      send({ type: 'presence', channel: 'post:123', status: 'viewing' });

      const ws = FakeWebSocket.latest();
      // Nothing sent yet on the WS itself (only queued)
      expect(ws.sent).toHaveLength(0);

      // Complete auth
      ws.simulateOpen();
      await vi.runAllTimersAsync();
      ws.simulateMessage({ type: 'auth:ok' });

      // Now the queued message should have been flushed
      const presenceMsgs = ws
        .parseSent()
        .filter((m) => (m as Record<string, unknown>).type === 'presence');
      expect(presenceMsgs).toHaveLength(1);
    });
  });

  describe('reconnect with exponential backoff', () => {
    it('should reconnect after close with increasing delay', async () => {
      const tokenProvider = createTokenProvider();
      const { ws: ws1 } = await connectAndAuth(tokenProvider);

      ws1.simulateClose();

      const { status } = useWebSocket();
      expect(status.value).toBe('reconnecting');

      // Advance 1s -> reconnect attempt
      await vi.advanceTimersByTimeAsync(1000);
      expect(FakeWebSocket.instances).toHaveLength(2);

      const ws2 = FakeWebSocket.latest();
      ws2.simulateOpen();
      await vi.runAllTimersAsync();
      // Should re-auth
      const authMsgs = ws2
        .parseSent()
        .filter((m) => (m as Record<string, unknown>).type === 'auth');
      expect(authMsgs).toHaveLength(1);
    });

    it('should reset backoff on successful auth:ok', async () => {
      const tokenProvider = createTokenProvider();
      const { ws: ws1 } = await connectAndAuth(tokenProvider);

      // First disconnect
      ws1.simulateClose();
      await vi.advanceTimersByTimeAsync(1000); // 1s backoff
      const ws2 = FakeWebSocket.latest();
      ws2.simulateOpen();
      await vi.runAllTimersAsync();
      ws2.simulateMessage({ type: 'auth:ok' });

      // Second disconnect — should be 1s again (reset)
      ws2.simulateClose();
      await vi.advanceTimersByTimeAsync(1000);
      expect(FakeWebSocket.instances).toHaveLength(3);
    });

    it('should cap backoff at 30 seconds after multiple retries', async () => {
      const tokenProvider = createTokenProvider();
      const { ws: ws1 } = await connectAndAuth(tokenProvider);

      // Close and fail to reconnect repeatedly to escalate backoff
      // After auth:ok, delay resets to 1000
      // Close -> delay=1000, close -> delay=2000, close -> delay=4000, close -> delay=8000, close -> delay=16000, close -> delay=30000, close -> delay=30000

      ws1.simulateClose(); // delay was 1000
      await vi.advanceTimersByTimeAsync(1000);
      let ws = FakeWebSocket.latest();
      ws.simulateClose(); // delay becomes 2000
      await vi.advanceTimersByTimeAsync(2000);
      ws = FakeWebSocket.latest();
      ws.simulateClose(); // delay becomes 4000
      await vi.advanceTimersByTimeAsync(4000);
      ws = FakeWebSocket.latest();
      ws.simulateClose(); // delay becomes 8000
      await vi.advanceTimersByTimeAsync(8000);
      ws = FakeWebSocket.latest();
      ws.simulateClose(); // delay becomes 16000
      await vi.advanceTimersByTimeAsync(16000);
      ws = FakeWebSocket.latest();
      ws.simulateClose(); // delay becomes 30000 (capped)
      await vi.advanceTimersByTimeAsync(30000);
      ws = FakeWebSocket.latest();
      ws.simulateClose(); // delay stays 30000
      // Verify it still reconnects after 30s (not more)
      const countBefore = FakeWebSocket.instances.length;
      await vi.advanceTimersByTimeAsync(30000);
      expect(FakeWebSocket.instances.length).toBe(countBefore + 1);
    });

    it('should set status to reconnecting on close', async () => {
      const tokenProvider = createTokenProvider();
      const { ws } = await connectAndAuth(tokenProvider);
      const { status } = useWebSocket();

      ws.simulateClose();
      expect(status.value).toBe('reconnecting');
    });

    it('should re-subscribe all channels after reconnect auth:ok', async () => {
      const tokenProvider = createTokenProvider();
      const { ws: ws1 } = await connectAndAuth(tokenProvider);
      const { subscribe } = useWebSocket();

      subscribe('post:123', vi.fn());
      subscribe('post:456', vi.fn());

      // Disconnect and reconnect
      ws1.simulateClose();
      await vi.advanceTimersByTimeAsync(1000);

      const ws2 = FakeWebSocket.latest();
      ws2.simulateOpen();
      await vi.runAllTimersAsync();
      ws2.simulateMessage({ type: 'auth:ok' });

      const subscribeMsgs = ws2
        .parseSent()
        .filter((m) => (m as Record<string, unknown>).type === 'subscribe');
      expect(subscribeMsgs).toHaveLength(2);

      const channels = subscribeMsgs.map((m) => (m as Record<string, unknown>).channel);
      expect(channels).toContain('post:123');
      expect(channels).toContain('post:456');
    });
  });

  describe('auth:error', () => {
    it('should set status to disconnected and not reconnect', async () => {
      const { connect, status } = useWebSocket();
      const tokenProvider = createTokenProvider();
      connect(tokenProvider);

      const ws = FakeWebSocket.latest();
      ws.simulateOpen();
      await vi.runAllTimersAsync();
      ws.simulateMessage({ type: 'auth:error', reason: 'bad token' });

      expect(status.value).toBe('disconnected');

      // Advance timers — no new WebSocket should be created
      const countBefore = FakeWebSocket.instances.length;
      await vi.advanceTimersByTimeAsync(60000);
      expect(FakeWebSocket.instances.length).toBe(countBefore);
    });
  });

  describe('auth:expired', () => {
    it('should re-call token provider and re-send auth', async () => {
      const tokenProvider = vi
        .fn()
        .mockResolvedValueOnce('old-token')
        .mockResolvedValueOnce('new-token');
      const { ws } = await connectAndAuth(tokenProvider);

      ws.simulateMessage({ type: 'auth:expired' });
      await vi.runAllTimersAsync();

      const authMsgs = ws.parseSent().filter((m) => (m as Record<string, unknown>).type === 'auth');
      // First auth + re-auth = 2
      expect(authMsgs).toHaveLength(2);
      expect(authMsgs[1]).toEqual({ type: 'auth', token: 'new-token' });
    });

    it('should keep handlers intact after auth:expired', async () => {
      const tokenProvider = vi.fn().mockResolvedValue('token');
      const { ws } = await connectAndAuth(tokenProvider);
      const { subscribe } = useWebSocket();

      const handler = vi.fn();
      subscribe('post:123', handler);

      ws.simulateMessage({ type: 'auth:expired' });
      await vi.runAllTimersAsync();

      // Handler should still be called for messages
      const msg: CommentNewMessage = {
        type: 'comment:new',
        channel: 'post:123',
        data: {
          id: 'c1',
          postId: '123',
          author: null,
          parentId: null,
          lineNumber: null,
          revisionId: null,
          revisionNumber: null,
          body: 'Hello',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      };
      ws.simulateMessage(msg);
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('disconnect', () => {
    it('should close socket and set status to disconnected', async () => {
      await connectAndAuth();
      const { disconnect, status } = useWebSocket();

      disconnect();

      expect(status.value).toBe('disconnected');
    });

    it('should cancel pending reconnect timer', async () => {
      const tokenProvider = createTokenProvider();
      const { ws } = await connectAndAuth(tokenProvider);
      const { disconnect } = useWebSocket();

      ws.simulateClose();
      // Reconnect is scheduled — cancel it
      disconnect();

      const countBefore = FakeWebSocket.instances.length;
      await vi.advanceTimersByTimeAsync(60000);
      expect(FakeWebSocket.instances.length).toBe(countBefore);
    });

    it('should clear handlers', async () => {
      await connectAndAuth();
      const { subscribe, disconnect } = useWebSocket();

      const handler = vi.fn();
      subscribe('post:123', handler);

      disconnect();

      // After reconnect handlers should be gone — we can verify by connecting again
      // and checking no subscribe frames are sent on auth:ok
      const { connect } = useWebSocket();
      connect(createTokenProvider());
      const ws2 = FakeWebSocket.latest();
      ws2.simulateOpen();
      await vi.runAllTimersAsync();
      ws2.simulateMessage({ type: 'auth:ok' });

      const subscribeMsgs = ws2
        .parseSent()
        .filter((m) => (m as Record<string, unknown>).type === 'subscribe');
      expect(subscribeMsgs).toHaveLength(0);
    });

    it('should be safe to call when no socket exists', () => {
      const { disconnect } = useWebSocket();
      expect(() => disconnect()).not.toThrow();
    });
  });

  describe('error event', () => {
    it('should handle error event without throwing', async () => {
      const { connect } = useWebSocket();
      connect(createTokenProvider());

      const ws = FakeWebSocket.latest();
      expect(() => ws.simulateError()).not.toThrow();
    });
  });

  describe('server message dispatch by type', () => {
    const commentData = {
      id: 'c1',
      postId: '123',
      author: null,
      parentId: null,
      lineNumber: null,
      revisionId: null,
      revisionNumber: null,
      body: 'Hello',
      createdAt: '2025-01-01T00:00:00Z',
      updatedAt: '2025-01-01T00:00:00Z',
    };

    const messageTypes: Array<{ description: string; msg: ServerMessage; channel: string }> = [
      {
        description: 'comment:new',
        msg: {
          type: 'comment:new',
          channel: 'post:123',
          data: commentData,
        } satisfies CommentNewMessage,
        channel: 'post:123',
      },
      {
        description: 'comment:updated',
        msg: {
          type: 'comment:updated',
          channel: 'post:123',
          data: commentData,
        } satisfies CommentUpdatedMessage,
        channel: 'post:123',
      },
      {
        description: 'comment:deleted',
        msg: {
          type: 'comment:deleted',
          channel: 'post:123',
          data: { id: 'c1' },
        } satisfies CommentDeletedMessage,
        channel: 'post:123',
      },
      {
        description: 'vote:updated',
        msg: {
          type: 'vote:updated',
          channel: 'post:123',
          data: { voteCount: 5 },
        } satisfies VoteUpdatedMessage,
        channel: 'post:123',
      },
      {
        description: 'revision:new',
        msg: {
          type: 'revision:new',
          channel: 'post:123',
          data: {
            id: 'r1',
            postId: '123',
            content: 'code',
            message: null,
            revisionNumber: 2,
            createdAt: '2025-01-01T00:00:00Z',
          },
        } satisfies RevisionNewMessage,
        channel: 'post:123',
      },
      {
        description: 'post:new',
        msg: {
          type: 'post:new',
          channel: 'feed',
          data: {
            id: 'p1',
            authorId: 'u1',
            title: 'New Post',
            contentType: 'snippet',
            language: null,
            visibility: 'public',
            isDraft: false,
            forkedFromId: null,
            linkUrl: null,
            linkPreview: null,
            voteCount: 0,
            viewCount: 0,
            deletedAt: null,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            author: { id: 'u1', displayName: 'User', avatarUrl: null },
            tags: [],
          },
        } satisfies PostNewMessage,
        channel: 'feed',
      },
      {
        description: 'post:updated',
        msg: {
          type: 'post:updated',
          channel: 'feed',
          data: {
            id: 'p1',
            authorId: 'u1',
            title: 'Updated Post',
            contentType: 'snippet',
            language: null,
            visibility: 'public',
            isDraft: false,
            forkedFromId: null,
            linkUrl: null,
            linkPreview: null,
            voteCount: 0,
            viewCount: 0,
            deletedAt: null,
            createdAt: '2025-01-01T00:00:00Z',
            updatedAt: '2025-01-01T00:00:00Z',
            author: { id: 'u1', displayName: 'User', avatarUrl: null },
            tags: [],
          },
        } satisfies PostUpdatedMessage,
        channel: 'feed',
      },
      {
        description: 'presence:update',
        msg: {
          type: 'presence:update',
          channel: 'post:123',
          data: {
            users: [
              {
                id: 'u1',
                email: 'a@b.com',
                displayName: 'User',
                avatarUrl: null,
                authProvider: 'local',
                createdAt: '2025-01-01T00:00:00Z',
                updatedAt: '2025-01-01T00:00:00Z',
              },
            ],
          },
        } satisfies PresenceUpdateMessage,
        channel: 'post:123',
      },
    ];

    it.each(messageTypes)(
      'should dispatch $description to the correct channel handler',
      async ({ msg, channel }) => {
        const { ws } = await connectAndAuth();
        const { subscribe } = useWebSocket();

        const handler = vi.fn();
        const otherHandler = vi.fn();
        subscribe(channel, handler);
        subscribe('other-channel', otherHandler);

        ws.simulateMessage(msg);

        expect(handler).toHaveBeenCalledTimes(1);
        expect(handler).toHaveBeenCalledWith(msg);
        expect(otherHandler).not.toHaveBeenCalled();
      },
    );
  });

  describe('edge-case branches', () => {
    it('should not schedule reconnect when onclose fires after intentional disconnect', async () => {
      const tokenProvider = createTokenProvider();
      const { connect, disconnect } = useWebSocket();
      connect(tokenProvider);

      const ws = FakeWebSocket.latest();
      ws.simulateOpen();
      await vi.runAllTimersAsync();
      ws.simulateMessage({ type: 'auth:ok' });

      // Capture the onclose handler before disconnect nullifies socket
      const savedOnclose = ws.onclose;

      disconnect();

      // Simulate what real browsers do: fire onclose asynchronously on the old socket
      if (savedOnclose) savedOnclose();

      // No reconnect should be attempted
      const countBefore = FakeWebSocket.instances.length;
      await vi.advanceTimersByTimeAsync(60000);
      expect(FakeWebSocket.instances.length).toBe(countBefore);
    });

    it('should handle message for channel with no handlers registered', async () => {
      const { ws } = await connectAndAuth();

      // Dispatch a message to a channel no one is subscribed to — should not throw
      const msg: CommentNewMessage = {
        type: 'comment:new',
        channel: 'unsubscribed-channel',
        data: {
          id: 'c1',
          postId: '123',
          author: null,
          parentId: null,
          lineNumber: null,
          revisionId: null,
          revisionNumber: null,
          body: 'Hello',
          createdAt: '2025-01-01T00:00:00Z',
          updatedAt: '2025-01-01T00:00:00Z',
        },
      };
      expect(() => ws.simulateMessage(msg)).not.toThrow();
    });

    it('should handle cleanup when handler set was already cleared by disconnect', async () => {
      await connectAndAuth();
      const { subscribe, disconnect } = useWebSocket();

      const handler = vi.fn();
      const cleanup = subscribe('post:123', handler);

      // disconnect clears all handlers
      disconnect();

      // Now calling cleanup should be safe (set is gone)
      expect(() => cleanup()).not.toThrow();
    });

    it('should use wss: protocol when page is served over https:', async () => {
      vi.resetModules();
      setActivePinia(createPinia());

      // Temporarily override window.location.protocol
      const originalProtocol = window.location.protocol;
      const originalHost = window.location.host;
      Object.defineProperty(window, 'location', {
        value: { protocol: 'https:', host: 'example.com' },
        writable: true,
        configurable: true,
      });

      try {
        const wsModule = await import('@/composables/useWebSocket');
        await import('@/stores/realtime');

        const { connect } = wsModule.useWebSocket();
        connect(createTokenProvider());

        const ws = FakeWebSocket.latest();
        expect(ws.url).toBe('wss://example.com/ws');
      } finally {
        Object.defineProperty(window, 'location', {
          value: { protocol: originalProtocol, host: originalHost },
          writable: true,
          configurable: true,
        });
      }
    });

    it('should handle VITE_WS_URL environment variable', async () => {
      // We need a fresh module load with the env var set
      vi.resetModules();
      // Set VITE_WS_URL before importing
      const originalEnv = import.meta.env.VITE_WS_URL;
      import.meta.env.VITE_WS_URL = 'ws://custom-host:9999/ws';

      try {
        const wsModule = await import('@/composables/useWebSocket');
        await import('@/stores/realtime');
        setActivePinia(createPinia());

        const { connect } = wsModule.useWebSocket();
        connect(createTokenProvider());

        const ws = FakeWebSocket.latest();
        expect(ws.url).toBe('ws://custom-host:9999/ws');
      } finally {
        if (originalEnv === undefined) {
          delete import.meta.env.VITE_WS_URL;
        } else {
          import.meta.env.VITE_WS_URL = originalEnv;
        }
      }
    });
  });

  describe('status reflects store', () => {
    it('should return a reactive status ref from the store', () => {
      const { status } = useWebSocket();
      const store = useRealtimeStore();

      expect(status.value).toBe('idle');
      store.setStatus('connected');
      expect(status.value).toBe('connected');
    });
  });
});
