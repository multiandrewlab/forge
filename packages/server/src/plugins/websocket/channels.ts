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
 */
export class ChannelManager {
  private readonly channels = new Map<string, Set<SocketLike>>();

  /** Add a socket to a channel. */
  subscribe(channel: string, ws: SocketLike): void {
    let subs = this.channels.get(channel);
    if (!subs) {
      subs = new Set();
      this.channels.set(channel, subs);
    }
    subs.add(ws);
  }

  /** Remove a socket from a channel. Prunes the channel if it becomes empty. */
  unsubscribe(channel: string, ws: SocketLike): void {
    const subs = this.channels.get(channel);
    if (!subs) return;
    subs.delete(ws);
    if (subs.size === 0) {
      this.channels.delete(channel);
    }
  }

  /**
   * Send an event to every subscriber on a channel.
   *
   * - Serializes `event` once via `JSON.stringify`.
   * - Skips sockets whose `readyState` is not OPEN (1).
   * - Optionally excludes a single socket (the sender).
   */
  broadcast(channel: string, event: ServerMessage, excludeWs?: SocketLike): void {
    const subs = this.channels.get(channel);
    if (!subs) return;

    const data = JSON.stringify(event);

    for (const ws of subs) {
      if (ws === excludeWs) continue;
      if (ws.readyState !== OPEN) continue;
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
  }
}
