import type { User } from '@forge/shared';

/** Entries older than this threshold (in ms) are evicted from presence tracking. */
export const PRESENCE_EVICTION_THRESHOLD_MS = 60_000;

interface PresenceEntry {
  user: User;
  lastSeen: number;
}

/**
 * Structural type for the subset of ChannelManager used by the eviction runner.
 * Avoids a hard import on channels.ts which may not exist yet (parallel WU).
 */
type ChannelBroadcaster = {
  broadcast(channel: string, event: { type: string; channel: string; data: unknown }): void;
};

/**
 * Tracks per-channel, per-user presence with a last-seen timestamp.
 *
 * Internal storage: `Map<channel, Map<userId, PresenceEntry>>`.
 */
export class PresenceTracker {
  private readonly channels = new Map<string, Map<string, PresenceEntry>>();

  /**
   * Update (or insert) a user's presence in a channel.
   *
   * @param channel - The channel identifier (e.g. `"post:123"`).
   * @param userId  - The user's unique ID.
   * @param user    - Full User object to store alongside the entry.
   * @param now     - Optional timestamp override; defaults to `Date.now()`.
   */
  update(channel: string, userId: string, user: User, now?: number): void {
    const timestamp = now ?? Date.now();
    let channelMap = this.channels.get(channel);
    if (!channelMap) {
      channelMap = new Map<string, PresenceEntry>();
      this.channels.set(channel, channelMap);
    }
    channelMap.set(userId, { user, lastSeen: timestamp });
  }

  /**
   * Explicitly remove a user from a channel.
   * If the channel becomes empty, the channel entry is pruned.
   */
  remove(channel: string, userId: string): void {
    const channelMap = this.channels.get(channel);
    if (!channelMap) {
      return;
    }
    channelMap.delete(userId);
    if (channelMap.size === 0) {
      this.channels.delete(channel);
    }
  }

  /**
   * Evict all entries whose `lastSeen` is older than
   * `PRESENCE_EVICTION_THRESHOLD_MS` relative to `now`.
   *
   * @param now - Optional timestamp override; defaults to `Date.now()`.
   * @returns Array of channel names that lost at least one entry.
   */
  evict(now?: number): string[] {
    const timestamp = now ?? Date.now();
    const affectedChannels: string[] = [];

    for (const [channel, channelMap] of this.channels) {
      let hadEviction = false;

      for (const [userId, entry] of channelMap) {
        if (timestamp - entry.lastSeen > PRESENCE_EVICTION_THRESHOLD_MS) {
          channelMap.delete(userId);
          hadEviction = true;
        }
      }

      if (hadEviction) {
        affectedChannels.push(channel);
      }

      if (channelMap.size === 0) {
        this.channels.delete(channel);
      }
    }

    return affectedChannels;
  }

  /**
   * Get all users currently present in a channel.
   *
   * **Ordering:** Users are returned in insertion order of the underlying Map.
   * When a user re-updates, their position is preserved (Map.set on an
   * existing key does not change iteration order).
   *
   * @returns Array of User objects; empty array if the channel has no viewers.
   */
  getViewers(channel: string): User[] {
    const channelMap = this.channels.get(channel);
    if (!channelMap) {
      return [];
    }
    return Array.from(channelMap.values()).map((entry) => entry.user);
  }
}

/**
 * Creates a `setInterval`-based eviction runner that periodically evicts stale
 * presence entries and broadcasts `presence:update` events for affected channels.
 *
 * @param tracker    - The PresenceTracker instance to evict from.
 * @param channels   - An object with a `broadcast` method (e.g. ChannelManager).
 * @param intervalMs - How often to run eviction, in ms. Defaults to 15000 (15s).
 * @returns A `NodeJS.Timeout` handle that can be passed to `clearInterval`.
 */
export function createPresenceEvictionInterval(
  tracker: PresenceTracker,
  channels: ChannelBroadcaster,
  intervalMs: number = 15_000,
): NodeJS.Timeout {
  return setInterval(() => {
    const evictedChannels = tracker.evict();
    for (const channel of evictedChannels) {
      channels.broadcast(channel, {
        type: 'presence:update',
        channel,
        data: { users: tracker.getViewers(channel) },
      });
    }
  }, intervalMs);
}
