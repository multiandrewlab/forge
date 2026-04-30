import type { ServerMessage } from '@forge/shared';

/**
 * Structural type for WebSocket — avoids hard dependency on `ws` package
 * while remaining compatible with the actual ws.WebSocket at runtime.
 */
type SocketLike = { readyState: number; send: (data: string) => void };

const OPEN = 1;

const EMPTY_SET: ReadonlySet<SocketLike> = new Set<SocketLike>();

/**
 * Manages channel-based pub/sub for WebSocket connections.
 *
 * Each channel maps to a set of subscribed sockets. `broadcast` serializes
 * the event once and fans it out, skipping closed sockets and an optional
 * excluded sender.
 *
 * For visibility-sensitive events on the `feed` channel (`post:new` and
 * `post:updated` carrying a private post), the broadcast loop applies a
 * per-recipient filter: a non-author subscriber will NOT receive the event.
 * Recipient identity is supplied via the optional `userId` parameter to
 * `subscribe()`; sockets without a tracked userId are treated as non-author
 * (skip) for private-post events — defensive default.
 */
export class ChannelManager {
  private readonly channels = new Map<string, Set<SocketLike>>();
  /**
   * Reverse map: socket → userId, populated at subscribe time so the
   * broadcast loop can identify the recipient without an external lookup.
   * Cleared in unsubscribe / removeFromAll once the socket is no longer
   * subscribed to any channel.
   */
  private readonly socketUserIds = new Map<SocketLike, string>();

  /** Add a socket to a channel. Optionally records the recipient userId. */
  subscribe(channel: string, ws: SocketLike, userId?: string): void {
    let subs = this.channels.get(channel);
    if (!subs) {
      subs = new Set();
      this.channels.set(channel, subs);
    }
    subs.add(ws);
    if (userId !== undefined) {
      this.socketUserIds.set(ws, userId);
    }
  }

  /** Remove a socket from a channel. Prunes the channel if it becomes empty. */
  unsubscribe(channel: string, ws: SocketLike): void {
    const subs = this.channels.get(channel);
    if (!subs) return;
    subs.delete(ws);
    if (subs.size === 0) {
      this.channels.delete(channel);
    }
    if (!this.isStillSubscribed(ws)) {
      this.socketUserIds.delete(ws);
    }
  }

  /**
   * Send an event to every subscriber on a channel.
   *
   * - Serializes `event` once via `JSON.stringify`.
   * - Skips sockets whose `readyState` is not OPEN (1).
   * - Optionally excludes a single socket (the sender).
   * - For `post:new` / `post:updated` on the `feed` channel carrying a
   *   private post, skips subscribers whose tracked userId is not the
   *   post's authorId (or who have no tracked userId at all).
   */
  broadcast(channel: string, event: ServerMessage, excludeWs?: SocketLike): void {
    const subs = this.channels.get(channel);
    if (!subs) return;

    const data = JSON.stringify(event);
    const visibilityFilter = getVisibilityFilter(event);

    for (const ws of subs) {
      if (ws === excludeWs) continue;
      if (ws.readyState !== OPEN) continue;
      if (visibilityFilter !== null) {
        const recipientUserId = this.socketUserIds.get(ws);
        if (recipientUserId !== visibilityFilter.authorId) continue;
      }
      ws.send(data);
    }
  }

  /** Return the set of sockets subscribed to a channel (empty set if unknown). */
  getSubscribers(channel: string): ReadonlySet<SocketLike> {
    return this.channels.get(channel) ?? EMPTY_SET;
  }

  /** Remove a socket from every channel. Prunes channels that become empty. */
  removeFromAll(ws: SocketLike): void {
    for (const [channel, subs] of this.channels) {
      subs.delete(ws);
      if (subs.size === 0) {
        this.channels.delete(channel);
      }
    }
    this.socketUserIds.delete(ws);
  }

  /** True iff the socket is still in at least one channel's subscriber set. */
  private isStillSubscribed(ws: SocketLike): boolean {
    for (const subs of this.channels.values()) {
      if (subs.has(ws)) return true;
    }
    return false;
  }
}

/**
 * Returns the visibility filter to apply for an event, or `null` if the event
 * is not visibility-sensitive. The filter applies to private `post:new` and
 * `post:updated` events; the discriminated-union schema pins both to the
 * `feed` channel, so an explicit channel check is not needed (and would be
 * unreachable by construction).
 */
function getVisibilityFilter(event: ServerMessage): { authorId: string } | null {
  if (event.type !== 'post:new' && event.type !== 'post:updated') return null;
  if (event.data.visibility !== 'private') return null;
  return { authorId: event.data.authorId };
}
