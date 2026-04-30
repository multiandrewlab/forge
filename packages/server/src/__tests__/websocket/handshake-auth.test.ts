import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleConnection } from '../../plugins/websocket/handler.js';
import type { ConnectionManager } from '../../plugins/websocket/connections.js';
import type { ChannelManager } from '../../plugins/websocket/channels.js';
import type { PresenceTracker } from '../../plugins/websocket/presence.js';

/**
 * WU7 — Handshake auth verification.
 *
 * Reaffirms that the WebSocket state machine starts in `awaiting-auth` and
 * rejects unauthenticated frames. This is a regression guard: if a future
 * change weakens the handshake, the per-recipient broadcast filter would have
 * no recipient identity to compare against (silent regression).
 */

type MessageHandler = (data: string | Buffer) => void;
type CloseHandler = () => void;
type SocketEventHandler = MessageHandler | CloseHandler;

function createFakeSocket() {
  const handlers: Record<string, SocketEventHandler> = {};
  return {
    readyState: 1,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn((event: string, cb: SocketEventHandler) => {
      handlers[event] = cb;
    }),
    _handlers: handlers,
  };
}

function createFakeApp() {
  return {
    jwt: {
      verify: vi.fn().mockImplementation((_token: string) => {
        throw new Error('jwt malformed');
      }),
    },
    log: { warn: vi.fn() },
  };
}

function createDeps() {
  return {
    connections: {
      addConnection: vi.fn(),
      removeConnection: vi.fn(),
    } as unknown as ConnectionManager,
    channels: {
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      removeFromAll: vi.fn(),
    } as unknown as ChannelManager,
    presence: {
      update: vi.fn(),
    } as unknown as PresenceTracker,
  };
}

const fakeReq = {} as Parameters<typeof handleConnection>[2];

describe('WebSocket /ws handshake auth (regression guard)', () => {
  let fakeSocket: ReturnType<typeof createFakeSocket>;
  let fakeApp: ReturnType<typeof createFakeApp>;
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeSocket = createFakeSocket();
    fakeApp = createFakeApp();
    deps = createDeps();
  });

  it('closes with 4001 when a non-auth frame arrives before authentication', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    // Simulate a subscribe frame BEFORE any auth — must be rejected.
    const onMessage = fakeSocket._handlers['message'] as MessageHandler;
    onMessage(JSON.stringify({ type: 'subscribe', channel: 'feed' }));

    expect(fakeSocket.close).toHaveBeenCalledWith(4001, 'auth-required');
    // Must NOT have called subscribe — the recipient userId is unknown
    expect(deps.channels.subscribe).not.toHaveBeenCalled();
    // Must NOT have added a connection without a verified userId
    expect(deps.connections.addConnection).not.toHaveBeenCalled();
  });

  it('closes with 4001 when a malformed JSON frame arrives before authentication', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    const onMessage = fakeSocket._handlers['message'] as MessageHandler;
    onMessage('this is not json');

    expect(fakeSocket.close).toHaveBeenCalledWith(4001, 'auth-required');
    expect(deps.connections.addConnection).not.toHaveBeenCalled();
  });

  it('closes with 4002 when an auth frame carries an invalid JWT', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    const onMessage = fakeSocket._handlers['message'] as MessageHandler;
    onMessage(JSON.stringify({ type: 'auth', token: 'not-a-real-jwt' }));

    expect(fakeApp.jwt.verify).toHaveBeenCalledWith('not-a-real-jwt');
    expect(fakeSocket.close).toHaveBeenCalledWith(4002, 'auth-failed');
    expect(deps.connections.addConnection).not.toHaveBeenCalled();
  });

  it('tracks userId via ConnectionManager.addConnection on successful auth', () => {
    // Override the verify to succeed for this test only
    fakeApp.jwt.verify.mockImplementationOnce(() => ({
      id: 'user-42',
      email: 'u42@example.com',
      displayName: 'User 42',
    }));

    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    const onMessage = fakeSocket._handlers['message'] as MessageHandler;
    onMessage(JSON.stringify({ type: 'auth', token: 'good-token' }));

    // ConnectionManager.addConnection(userId, socket, clientId) — userId tracked per-socket
    expect(deps.connections.addConnection).toHaveBeenCalledOnce();
    const callArgs = (deps.connections.addConnection as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(callArgs[0]).toBe('user-42');
    expect(typeof callArgs[2]).toBe('string'); // clientId is a generated UUID

    // Ack frame must be sent
    expect(fakeSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth:ok' }));
  });
});
