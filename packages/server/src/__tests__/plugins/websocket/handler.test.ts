import { describe, it, expect, vi, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { handleConnection } from '../../../plugins/websocket/handler.js';
import type { ConnectionManager } from '../../../plugins/websocket/connections.js';
import type { ChannelManager } from '../../../plugins/websocket/channels.js';
import type { PresenceTracker } from '../../../plugins/websocket/presence.js';

// ── Helpers ──────────────────────────────────────────────────────────

/** Minimal fake socket with event emitter pattern. */
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

function createFakeApp(
  verifyResult: Record<string, unknown> | Error = {
    id: 'user-1',
    email: 'test@example.com',
    displayName: 'Test User',
  },
) {
  return {
    jwt: {
      verify: vi.fn().mockImplementation((_token: string) => {
        if (verifyResult instanceof Error) {
          throw verifyResult;
        }
        return verifyResult;
      }),
    },
    log: {
      warn: vi.fn(),
    },
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

// Spy on randomUUID so we can predict the generated clientId
vi.mock('node:crypto', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:crypto')>();
  return {
    ...original,
    randomUUID: vi.fn(() => 'mock-uuid-1234'),
  };
});

// ── Tests ────────────────────────────────────────────────────────────

describe('handleConnection', () => {
  let fakeSocket: ReturnType<typeof createFakeSocket>;
  let fakeApp: ReturnType<typeof createFakeApp>;
  let deps: ReturnType<typeof createDeps>;

  beforeEach(() => {
    vi.clearAllMocks();
    fakeSocket = createFakeSocket();
    fakeApp = createFakeApp();
    deps = createDeps();
  });

  // ── Edge case 1: Pre-auth non-auth frame → close(4001) ────────────

  it('closes with 4001 when a non-auth message arrives before authentication', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    const messageHandler = fakeSocket._handlers['message'];
    expect(messageHandler).toBeDefined();

    messageHandler(JSON.stringify({ type: 'subscribe', channel: 'post:1' }));

    expect(fakeSocket.close).toHaveBeenCalledWith(4001, 'auth-required');
    expect(fakeSocket.send).not.toHaveBeenCalled();
  });

  // ── Edge case 2: Pre-auth malformed JSON → close(4001) ────────────

  it('closes with 4001 when malformed JSON arrives before authentication', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    fakeSocket._handlers['message']('not valid json');

    expect(fakeSocket.close).toHaveBeenCalledWith(4001, 'auth-required');
    expect(fakeApp.log.warn).toHaveBeenCalled();
  });

  // ── Edge case 3: Auth success ──────────────────────────────────────

  it('sends auth:ok and adds to ConnectionManager on valid JWT', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid-token' }));

    expect(fakeApp.jwt.verify).toHaveBeenCalledWith('valid-token');
    expect(fakeSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth:ok' }));
    expect(deps.connections.addConnection).toHaveBeenCalledWith(
      'user-1',
      fakeSocket,
      'mock-uuid-1234',
    );
  });

  // ── Edge case 4: Auth failure (bad token) ──────────────────────────

  it('sends auth:error and closes with 4002 on invalid JWT', () => {
    const badApp = createFakeApp(new Error('jwt expired'));

    handleConnection(
      badApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'bad-token' }));

    expect(fakeSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'auth:error', reason: 'jwt expired' }),
    );
    expect(fakeSocket.close).toHaveBeenCalledWith(4002, 'auth-failed');
  });

  // ── Edge case 5: Authenticated subscribe ───────────────────────────

  it('calls channelManager.subscribe when authenticated and type=subscribe', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    // Authenticate first
    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));

    // Subscribe
    fakeSocket._handlers['message'](JSON.stringify({ type: 'subscribe', channel: 'post:1' }));

    expect(deps.channels.subscribe).toHaveBeenCalledWith('post:1', fakeSocket);
  });

  // ── Edge case 6: Authenticated unsubscribe ─────────────────────────

  it('calls channelManager.unsubscribe when authenticated and type=unsubscribe', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));
    fakeSocket._handlers['message'](JSON.stringify({ type: 'unsubscribe', channel: 'post:1' }));

    expect(deps.channels.unsubscribe).toHaveBeenCalledWith('post:1', fakeSocket);
  });

  // ── Edge case 7: Authenticated presence ────────────────────────────

  it('calls presenceTracker.update when authenticated and type=presence', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));
    fakeSocket._handlers['message'](
      JSON.stringify({ type: 'presence', channel: 'post:42', status: 'viewing' }),
    );

    expect(deps.presence.update).toHaveBeenCalledWith(
      'post:42',
      'user-1',
      expect.objectContaining({
        id: 'user-1',
        email: 'test@example.com',
        displayName: 'Test User',
      }),
    );
  });

  // ── Edge case 8: Authenticated unknown type → ignore ───────────────

  it('logs a warning and does not close on unknown message type while authenticated', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));
    fakeSocket._handlers['message'](JSON.stringify({ type: 'unknown-action' }));

    expect(fakeApp.log.warn).toHaveBeenCalled();
    expect(fakeSocket.close).not.toHaveBeenCalled();
    expect(deps.channels.subscribe).not.toHaveBeenCalled();
    expect(deps.channels.unsubscribe).not.toHaveBeenCalled();
    expect(deps.presence.update).not.toHaveBeenCalled();
  });

  // ── Edge case 9: Authenticated malformed JSON → ignore ─────────────

  it('logs a warning and does not close on malformed JSON while authenticated', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));

    // Clear mocks to isolate the malformed-JSON call
    vi.clearAllMocks();
    // Re-mock verify to still work for expiry check
    fakeApp.jwt.verify.mockReturnValue({
      id: 'user-1',
      email: 'test@example.com',
      displayName: 'Test User',
    });

    fakeSocket._handlers['message']('this is not json');

    expect(fakeApp.log.warn).toHaveBeenCalled();
    expect(fakeSocket.close).not.toHaveBeenCalled();
    expect(deps.channels.subscribe).not.toHaveBeenCalled();
  });

  // ── Edge case 10: JWT expired mid-session → auth:expired ───────────

  it('sends auth:expired and reverts to awaiting-auth when JWT expires mid-session', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    // Authenticate successfully
    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));
    expect(fakeSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth:ok' }));

    // Now make the JWT expired on next verify
    fakeApp.jwt.verify.mockImplementation(() => {
      throw new Error('token expired');
    });

    // Send any authenticated message — the handler should re-verify the token
    fakeSocket._handlers['message'](JSON.stringify({ type: 'subscribe', channel: 'post:1' }));

    expect(fakeSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth:expired' }));
    // Should NOT close the socket
    expect(fakeSocket.close).not.toHaveBeenCalled();
    // Should NOT have called subscribe (the token was expired)
    expect(deps.channels.subscribe).not.toHaveBeenCalled();
  });

  // ── Edge case 11: Re-auth after expiry ─────────────────────────────

  it('accepts re-authentication after token expiry and generates a new clientId', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    // First auth
    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));
    expect(deps.connections.addConnection).toHaveBeenCalledTimes(1);

    // Expire the token
    fakeApp.jwt.verify.mockImplementation(() => {
      throw new Error('token expired');
    });
    fakeSocket._handlers['message'](JSON.stringify({ type: 'subscribe', channel: 'post:1' }));
    expect(fakeSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth:expired' }));

    // Restore valid verify and update the mock UUID for re-auth
    (randomUUID as ReturnType<typeof vi.fn>).mockReturnValueOnce('mock-uuid-5678');
    fakeApp.jwt.verify.mockReturnValue({
      id: 'user-1',
      email: 'test@example.com',
      displayName: 'Test User',
    });

    // Re-authenticate
    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'new-valid-token' }));

    expect(fakeSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth:ok' }));
    // Should have been added again with new clientId
    expect(deps.connections.addConnection).toHaveBeenCalledWith(
      'user-1',
      fakeSocket,
      'mock-uuid-5678',
    );
  });

  // ── Edge case 12: Close event → cleanup ────────────────────────────

  it('calls removeFromAll and removeConnection on close when authenticated', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    // Authenticate
    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));

    // Close
    fakeSocket._handlers['close']();

    expect(deps.channels.removeFromAll).toHaveBeenCalledWith(fakeSocket);
    expect(deps.connections.removeConnection).toHaveBeenCalledWith(
      'user-1',
      fakeSocket,
      'mock-uuid-1234',
    );
  });

  // ── Edge case 13: Pre-auth close → no removeConnection ────────────

  it('does not call removeConnection on close when never authenticated', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    // Close without authenticating
    fakeSocket._handlers['close']();

    expect(deps.channels.removeFromAll).toHaveBeenCalledWith(fakeSocket);
    expect(deps.connections.removeConnection).not.toHaveBeenCalled();
  });

  // ── Additional: auth message with invalid schema (missing token) ───

  it('closes with 4001 when auth message has missing token field before auth', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    // Valid JSON but invalid auth schema (missing token field)
    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth' }));

    // Should close because the auth schema validation fails and state is awaiting-auth
    expect(fakeSocket.close).toHaveBeenCalledWith(4001, 'auth-required');
  });

  // ── Cleanup after re-auth removes old connection ───────────────────

  it('removes previous connection entry before adding new one on re-auth', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    // First auth
    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));

    // Expire
    fakeApp.jwt.verify.mockImplementation(() => {
      throw new Error('token expired');
    });
    fakeSocket._handlers['message'](JSON.stringify({ type: 'subscribe', channel: 'ch' }));

    // Re-auth with new token
    (randomUUID as ReturnType<typeof vi.fn>).mockReturnValueOnce('mock-uuid-new');
    fakeApp.jwt.verify.mockReturnValue({
      id: 'user-2',
      email: 'new@example.com',
      displayName: 'New User',
    });
    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'new-token' }));

    // The old connection (user-1 / mock-uuid-1234) should have been removed
    expect(deps.connections.removeConnection).toHaveBeenCalledWith(
      'user-1',
      fakeSocket,
      'mock-uuid-1234',
    );
    // New connection added
    expect(deps.connections.addConnection).toHaveBeenCalledWith(
      'user-2',
      fakeSocket,
      'mock-uuid-new',
    );
  });

  // ── Re-auth while already authenticated (no expiry) ─────────────

  it('allows re-auth while already authenticated, replacing old connection', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    // First auth
    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));
    expect(deps.connections.addConnection).toHaveBeenCalledTimes(1);

    // Re-auth while still authenticated (token NOT expired)
    (randomUUID as ReturnType<typeof vi.fn>).mockReturnValueOnce('mock-uuid-reauth');
    fakeApp.jwt.verify.mockReturnValue({ id: 'user-2', email: 'new@test.com', displayName: 'New' });

    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'new-valid' }));

    // Old connection removed
    expect(deps.connections.removeConnection).toHaveBeenCalledWith(
      'user-1',
      fakeSocket,
      'mock-uuid-1234',
    );
    // New connection added
    expect(deps.connections.addConnection).toHaveBeenCalledWith(
      'user-2',
      fakeSocket,
      'mock-uuid-reauth',
    );
    expect(fakeSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth:ok' }));
  });

  it('sends auth:error and closes with 4002 on re-auth with bad token while authenticated', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    // First auth succeeds
    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));

    // Re-auth with bad token — first verify (expiry check) passes, second verify (re-auth) fails
    let verifyCallCount = 0;
    fakeApp.jwt.verify.mockImplementation(() => {
      verifyCallCount++;
      if (verifyCallCount === 1) {
        // expiry check succeeds
        return { id: 'user-1', email: 'test@example.com', displayName: 'Test User' };
      }
      // re-auth verify fails
      throw new Error('invalid signature');
    });

    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'bad-reauth-token' }));

    expect(fakeSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'auth:error', reason: 'invalid signature' }),
    );
    expect(fakeSocket.close).toHaveBeenCalledWith(4002, 'auth-failed');
  });

  it('logs warn and returns when re-auth message has invalid schema while authenticated', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    // First auth
    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));

    // Send auth message without token while authenticated
    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth' }));

    expect(fakeApp.log.warn).toHaveBeenCalledWith('WebSocket: invalid re-auth message');
    expect(fakeSocket.close).not.toHaveBeenCalled();
  });

  // ── Subscribe/unsubscribe with invalid schema ──────────────────────

  it('ignores subscribe message with missing channel field', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));
    fakeSocket._handlers['message'](JSON.stringify({ type: 'subscribe' }));

    expect(deps.channels.subscribe).not.toHaveBeenCalled();
    expect(fakeSocket.close).not.toHaveBeenCalled();
  });

  it('ignores unsubscribe message with missing channel field', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));
    fakeSocket._handlers['message'](JSON.stringify({ type: 'unsubscribe' }));

    expect(deps.channels.unsubscribe).not.toHaveBeenCalled();
    expect(fakeSocket.close).not.toHaveBeenCalled();
  });

  it('ignores presence message with invalid schema', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));
    // Missing channel and status fields
    fakeSocket._handlers['message'](JSON.stringify({ type: 'presence' }));

    expect(deps.presence.update).not.toHaveBeenCalled();
    expect(fakeSocket.close).not.toHaveBeenCalled();
  });

  // ── Re-auth error with non-Error throw ─────────────────────────────

  it('handles non-Error throw on auth with reason "unknown error"', () => {
    const throwApp = createFakeApp(new Error('placeholder'));
    throwApp.jwt.verify.mockImplementation(() => {
      throw 'string-error';
    });

    handleConnection(
      throwApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'any' }));

    expect(fakeSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'auth:error', reason: 'unknown error' }),
    );
    expect(fakeSocket.close).toHaveBeenCalledWith(4002, 'auth-failed');
  });

  it('handles non-Error throw on re-auth while authenticated with reason "unknown error"', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    // Auth first
    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'valid' }));

    // Make re-auth throw non-Error
    let verifyCallCount = 0;
    fakeApp.jwt.verify.mockImplementation(() => {
      verifyCallCount++;
      if (verifyCallCount === 1) {
        return { id: 'user-1', email: 'test@example.com', displayName: 'Test User' };
      }
      throw 'not-an-error-object';
    });

    fakeSocket._handlers['message'](JSON.stringify({ type: 'auth', token: 'reauth' }));

    expect(fakeSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'auth:error', reason: 'unknown error' }),
    );
    expect(fakeSocket.close).toHaveBeenCalledWith(4002, 'auth-failed');
  });

  // ── Buffer message data ────────────────────────────────────────────

  it('handles Buffer message data (converts to string)', () => {
    handleConnection(
      fakeApp as Parameters<typeof handleConnection>[0],
      fakeSocket as unknown as Parameters<typeof handleConnection>[1],
      fakeReq,
      deps,
    );

    // Send a Buffer instead of a string
    const buffer = Buffer.from(JSON.stringify({ type: 'auth', token: 'valid' }));
    fakeSocket._handlers['message'](buffer);

    expect(fakeSocket.send).toHaveBeenCalledWith(JSON.stringify({ type: 'auth:ok' }));
  });
});
