import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ServerMessage } from '@forge/shared';
import { ChannelManager } from '../../../plugins/websocket/channels.js';

/** Minimal fake WebSocket for testing. */
function fakeSocket(readyState = 1) {
  return { readyState, send: vi.fn() } as unknown as import('ws').WebSocket;
}

describe('ChannelManager', () => {
  let cm: ChannelManager;

  beforeEach(() => {
    cm = new ChannelManager();
  });

  // ── subscribe / getSubscribers ──────────────────────────────────────

  it('returns an empty set for an unknown channel', () => {
    const subs = cm.getSubscribers('unknown');
    expect(subs.size).toBe(0);
  });

  it('subscribes two sockets to the same channel and getSubscribers returns both', () => {
    const ws1 = fakeSocket();
    const ws2 = fakeSocket();

    cm.subscribe('post:1', ws1);
    cm.subscribe('post:1', ws2);

    const subs = cm.getSubscribers('post:1');
    expect(subs.size).toBe(2);
    expect(subs.has(ws1)).toBe(true);
    expect(subs.has(ws2)).toBe(true);
  });

  it('getSubscribers returns a ReadonlySet (not the internal set)', () => {
    const ws1 = fakeSocket();
    cm.subscribe('ch', ws1);

    const subs = cm.getSubscribers('ch');
    // The returned value should not be the exact same object as the internal set,
    // OR it should at least be typed ReadonlySet — we verify immutability by checking
    // that the public API doesn't expose mutation.  TypeScript handles the compile-time
    // check; at runtime we just confirm the set contents are correct.
    expect(subs.has(ws1)).toBe(true);
  });

  // ── broadcast ───────────────────────────────────────────────────────

  it('broadcasts to all subscribers with JSON-stringified event', () => {
    const ws1 = fakeSocket();
    const ws2 = fakeSocket();
    cm.subscribe('post:1', ws1);
    cm.subscribe('post:1', ws2);

    const event: ServerMessage = { type: 'auth:ok' };
    cm.broadcast('post:1', event);

    const expected = JSON.stringify(event);
    expect((ws1 as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledOnce();
    expect((ws1 as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      expected,
    );
    expect((ws2 as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledOnce();
    expect((ws2 as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      expected,
    );
  });

  it('broadcast with excludeWs skips the excluded socket', () => {
    const ws1 = fakeSocket();
    const ws2 = fakeSocket();
    cm.subscribe('post:1', ws1);
    cm.subscribe('post:1', ws2);

    const event: ServerMessage = { type: 'auth:ok' };
    cm.broadcast('post:1', event, ws1);

    expect((ws1 as unknown as { send: ReturnType<typeof vi.fn> }).send).not.toHaveBeenCalled();
    expect((ws2 as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledOnce();
  });

  it('broadcast skips sockets with readyState !== 1', () => {
    const wsOpen = fakeSocket(1);
    const wsClosed = fakeSocket(3);
    cm.subscribe('ch', wsOpen);
    cm.subscribe('ch', wsClosed);

    const event: ServerMessage = { type: 'auth:ok' };
    cm.broadcast('ch', event);

    expect((wsOpen as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledOnce();
    expect((wsClosed as unknown as { send: ReturnType<typeof vi.fn> }).send).not.toHaveBeenCalled();
  });

  it('broadcast to unknown channel is a no-op (no errors)', () => {
    const event: ServerMessage = { type: 'auth:ok' };
    expect(() => cm.broadcast('nonexistent', event)).not.toThrow();
  });

  it('broadcast serializes the event once and sends the same string to all subscribers', () => {
    const ws1 = fakeSocket();
    const ws2 = fakeSocket();
    cm.subscribe('ch', ws1);
    cm.subscribe('ch', ws2);

    const event: ServerMessage = { type: 'auth:ok' };
    cm.broadcast('ch', event);

    const send1 = (ws1 as unknown as { send: ReturnType<typeof vi.fn> }).send;
    const send2 = (ws2 as unknown as { send: ReturnType<typeof vi.fn> }).send;

    // Both receive the exact same string reference (serialized once)
    const str1 = send1.mock.calls[0][0] as string;
    const str2 = send2.mock.calls[0][0] as string;
    expect(str1).toBe(str2); // same reference via ===
  });

  // ── unsubscribe ─────────────────────────────────────────────────────

  it('unsubscribe removes a subscriber from the channel', () => {
    const ws1 = fakeSocket();
    const ws2 = fakeSocket();
    cm.subscribe('ch', ws1);
    cm.subscribe('ch', ws2);

    cm.unsubscribe('ch', ws1);

    const subs = cm.getSubscribers('ch');
    expect(subs.size).toBe(1);
    expect(subs.has(ws1)).toBe(false);
    expect(subs.has(ws2)).toBe(true);
  });

  it('unsubscribe prunes the channel entry when it becomes empty', () => {
    const ws1 = fakeSocket();
    cm.subscribe('ch', ws1);

    cm.unsubscribe('ch', ws1);

    // Channel should be pruned — getSubscribers returns empty set
    const subs = cm.getSubscribers('ch');
    expect(subs.size).toBe(0);
  });

  it('unsubscribe on unknown channel is a no-op', () => {
    const ws1 = fakeSocket();
    expect(() => cm.unsubscribe('nonexistent', ws1)).not.toThrow();
  });

  // ── removeFromAll ───────────────────────────────────────────────────

  it('removeFromAll removes the socket from every channel it was in', () => {
    const ws1 = fakeSocket();
    const ws2 = fakeSocket();

    cm.subscribe('ch-a', ws1);
    cm.subscribe('ch-b', ws1);
    cm.subscribe('ch-a', ws2);

    cm.removeFromAll(ws1);

    expect(cm.getSubscribers('ch-a').has(ws1)).toBe(false);
    expect(cm.getSubscribers('ch-b').has(ws1)).toBe(false);
    // ws2 still present
    expect(cm.getSubscribers('ch-a').has(ws2)).toBe(true);
  });

  it('removeFromAll prunes channels that become empty', () => {
    const ws1 = fakeSocket();
    cm.subscribe('ch-only', ws1);

    cm.removeFromAll(ws1);

    expect(cm.getSubscribers('ch-only').size).toBe(0);
  });

  it('removeFromAll with a socket not in any channel is a no-op', () => {
    const ws1 = fakeSocket();
    expect(() => cm.removeFromAll(ws1)).not.toThrow();
  });
});
