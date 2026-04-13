/**
 * Structural type for WebSocket connections.
 *
 * `ws` types are not yet available as a direct dependency — `@fastify/websocket`
 * (which brings `ws`) will be installed in WU-005. This narrow interface covers
 * the surface area needed by ConnectionManager and downstream consumers.
 */
export interface SocketLike {
  readyState: number;
  send: (data: string) => void;
}

const EMPTY_SET: ReadonlySet<SocketLike> = Object.freeze(new Set<SocketLike>());

/**
 * Tracks WebSocket connections per user, supporting multiple tabs per user.
 *
 * - `userConnections`: Map<userId, Set<SocketLike>> — all sockets for a user.
 * - `clientIndex`: Map<clientId, SocketLike> — lookup a single socket by its
 *   client-assigned UUID (used for sender-exclusion broadcasts).
 */
export class ConnectionManager {
  private readonly userConnections = new Map<string, Set<SocketLike>>();
  private readonly clientIndex = new Map<string, SocketLike>();

  addConnection(userId: string, ws: SocketLike, clientId: string): void {
    let sockets = this.userConnections.get(userId);
    if (!sockets) {
      sockets = new Set<SocketLike>();
      this.userConnections.set(userId, sockets);
    }
    sockets.add(ws);
    this.clientIndex.set(clientId, ws);
  }

  removeConnection(userId: string, ws: SocketLike, clientId: string): void {
    const sockets = this.userConnections.get(userId);
    if (sockets) {
      sockets.delete(ws);
      if (sockets.size === 0) {
        this.userConnections.delete(userId);
      }
    }
    this.clientIndex.delete(clientId);
  }

  getConnections(userId: string): ReadonlySet<SocketLike> {
    return this.userConnections.get(userId) ?? EMPTY_SET;
  }

  getAllConnections(): ReadonlyMap<string, ReadonlySet<SocketLike>> {
    return this.userConnections;
  }

  findByClientId(clientId: string): SocketLike | undefined {
    return this.clientIndex.get(clientId);
  }
}
