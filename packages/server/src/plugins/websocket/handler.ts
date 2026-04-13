import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { WebSocket } from 'ws';
import { randomUUID } from 'node:crypto';
import {
  authMessageSchema,
  subscribeMessageSchema,
  unsubscribeMessageSchema,
  presenceMessageSchema,
} from '@forge/shared';
import type { User } from '@forge/shared';
import type { ConnectionManager } from './connections.js';
import type { ChannelManager } from './channels.js';
import type { PresenceTracker } from './presence.js';

interface HandlerDeps {
  connections: ConnectionManager;
  channels: ChannelManager;
  presence: PresenceTracker;
}

type State = 'awaiting-auth' | 'authenticated';

/**
 * Convert JWT claims to a full User object for presence tracking.
 *
 * Trade-off: The JWT only contains { id, email, displayName }. We fill the
 * remaining User fields with sensible defaults. A future work unit can fetch
 * fresh user data from the DB if avatar/etc matter for the presence UI.
 */
function jwtToUser(payload: { id: string; email: string; displayName: string }): User {
  return {
    id: payload.id,
    email: payload.email,
    displayName: payload.displayName,
    avatarUrl: null,
    authProvider: 'local' as const,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  };
}

/**
 * WebSocket connection handler implementing the auth-handshake state machine.
 *
 * States:
 * - `awaiting-auth`: only `auth` messages accepted; everything else closes with 4001.
 * - `authenticated`: dispatches `subscribe`, `unsubscribe`, `presence`; unknown types ignored.
 *
 * JWT is re-verified on every authenticated frame. If the token has expired,
 * the handler sends `auth:expired`, reverts to `awaiting-auth`, and accepts
 * a new `auth` frame without closing the socket.
 */
export function handleConnection(
  app: FastifyInstance,
  socket: WebSocket,
  _req: FastifyRequest,
  deps: HandlerDeps,
): void {
  let state: State = 'awaiting-auth';
  let userId: string | undefined;
  let clientId: string | undefined;
  let storedToken: string | undefined;

  socket.on('message', (rawData: Buffer | string) => {
    const data = typeof rawData === 'string' ? rawData : rawData.toString('utf8');

    // ── Parse JSON ──────────────────────────────────────────────────
    let parsed: unknown;
    try {
      parsed = JSON.parse(data);
    } catch {
      if (state === 'awaiting-auth') {
        app.log.warn('WebSocket: malformed JSON before auth');
        socket.close(4001, 'auth-required');
      } else {
        app.log.warn('WebSocket: malformed JSON while authenticated');
      }
      return;
    }

    // ── Awaiting auth state ─────────────────────────────────────────
    if (state === 'awaiting-auth') {
      const authResult = authMessageSchema.safeParse(parsed);
      if (!authResult.success) {
        socket.close(4001, 'auth-required');
        return;
      }

      try {
        const jwtPayload = app.jwt.verify(authResult.data.token) as {
          id: string;
          email: string;
          displayName: string;
        };
        state = 'authenticated';
        userId = jwtPayload.id;
        clientId = randomUUID();
        storedToken = authResult.data.token;

        deps.connections.addConnection(
          userId,
          socket as unknown as Parameters<typeof deps.connections.addConnection>[1],
          clientId,
        );
        socket.send(JSON.stringify({ type: 'auth:ok' }));
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown error';
        socket.send(JSON.stringify({ type: 'auth:error', reason }));
        socket.close(4002, 'auth-failed');
      }
      return;
    }

    // ── Authenticated state ─────────────────────────────────────────
    // Re-verify stored JWT on every frame to detect expiry
    try {
      app.jwt.verify(storedToken as string);
    } catch {
      // Token expired mid-session
      socket.send(JSON.stringify({ type: 'auth:expired' }));

      // Clean up the old connection entry
      if (userId && clientId) {
        deps.connections.removeConnection(
          userId,
          socket as unknown as Parameters<typeof deps.connections.removeConnection>[1],
          clientId,
        );
      }

      state = 'awaiting-auth';
      userId = undefined;
      clientId = undefined;
      storedToken = undefined;
      return;
    }

    // ── Dispatch authenticated messages ─────────────────────────────
    const obj = parsed as Record<string, unknown>;
    const type = obj['type'];

    if (type === 'auth') {
      // Re-auth while already authenticated: remove old, add new
      const authResult = authMessageSchema.safeParse(parsed);
      if (!authResult.success) {
        app.log.warn('WebSocket: invalid re-auth message');
        return;
      }

      try {
        const jwtPayload = app.jwt.verify(authResult.data.token) as {
          id: string;
          email: string;
          displayName: string;
        };

        // Remove old connection
        if (userId && clientId) {
          deps.connections.removeConnection(
            userId,
            socket as unknown as Parameters<typeof deps.connections.removeConnection>[1],
            clientId,
          );
        }

        userId = jwtPayload.id;
        clientId = randomUUID();
        storedToken = authResult.data.token;

        deps.connections.addConnection(
          userId,
          socket as unknown as Parameters<typeof deps.connections.addConnection>[1],
          clientId,
        );
        socket.send(JSON.stringify({ type: 'auth:ok' }));
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'unknown error';
        socket.send(JSON.stringify({ type: 'auth:error', reason }));
        socket.close(4002, 'auth-failed');
      }
      return;
    }

    if (type === 'subscribe') {
      const result = subscribeMessageSchema.safeParse(parsed);
      if (result.success) {
        deps.channels.subscribe(
          result.data.channel,
          socket as unknown as Parameters<typeof deps.channels.subscribe>[1],
        );
      }
      return;
    }

    if (type === 'unsubscribe') {
      const result = unsubscribeMessageSchema.safeParse(parsed);
      if (result.success) {
        deps.channels.unsubscribe(
          result.data.channel,
          socket as unknown as Parameters<typeof deps.channels.unsubscribe>[1],
        );
      }
      return;
    }

    if (type === 'presence') {
      const result = presenceMessageSchema.safeParse(parsed);
      if (result.success && userId) {
        const user = jwtToUser(
          app.jwt.verify(storedToken as string) as {
            id: string;
            email: string;
            displayName: string;
          },
        );
        deps.presence.update(result.data.channel, userId, user);
      }
      return;
    }

    // Unknown message type
    app.log.warn({ type }, 'WebSocket: unknown message type while authenticated');
  });

  socket.on('close', () => {
    deps.channels.removeFromAll(
      socket as unknown as Parameters<typeof deps.channels.removeFromAll>[0],
    );
    if (userId && clientId) {
      deps.connections.removeConnection(
        userId,
        socket as unknown as Parameters<typeof deps.connections.removeConnection>[1],
        clientId,
      );
    }
  });
}
