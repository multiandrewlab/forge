import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ServerMessage } from '@forge/shared';
import { ChannelManager } from '../../plugins/websocket/channels.js';

/**
 * WU7 — Per-recipient visibility filter for `feed` channel broadcasts.
 *
 * The ChannelManager.broadcast() must skip `post:new` / `post:updated` events
 * for private posts when the recipient is NOT the post's author. Public posts
 * fan out to all subscribers as before.
 *
 * Mechanism (chosen): track the recipient userId at subscribe time so the
 * channel manager can apply the filter internally without changing call-sites.
 */

/** Minimal fake WebSocket — readyState 1 = OPEN. */
function fakeSocket(readyState = 1) {
  return { readyState, send: vi.fn() } as unknown as import('ws').WebSocket;
}

/** Build a minimal PostWithAuthor-shaped payload for tests. */
function buildPostData(overrides: Record<string, unknown>) {
  return {
    id: 'post-1',
    authorId: 'author-id',
    title: 'Hello',
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
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    author: { id: 'author-id', displayName: 'Author', avatarUrl: null },
    tags: [],
    ...overrides,
  };
}

describe('ChannelManager — feed-channel per-recipient visibility filter', () => {
  let cm: ChannelManager;

  beforeEach(() => {
    cm = new ChannelManager();
  });

  // ── post:new ────────────────────────────────────────────────────────

  it('does NOT send post:new for a private post to non-owner subscribers', () => {
    const ownerSocket = fakeSocket();
    const nonOwnerSocket = fakeSocket();

    cm.subscribe('feed', ownerSocket, 'author-id');
    cm.subscribe('feed', nonOwnerSocket, 'other-id');

    const event: ServerMessage = {
      type: 'post:new',
      channel: 'feed',
      data: buildPostData({ visibility: 'private', authorId: 'author-id' }),
    };

    cm.broadcast('feed', event);

    const expected = JSON.stringify(event);
    expect(
      (ownerSocket as unknown as { send: ReturnType<typeof vi.fn> }).send,
    ).toHaveBeenCalledWith(expected);
    expect(
      (nonOwnerSocket as unknown as { send: ReturnType<typeof vi.fn> }).send,
    ).not.toHaveBeenCalled();
  });

  it('sends post:new for a public post to ALL subscribers (owner and others)', () => {
    const ownerSocket = fakeSocket();
    const otherSocket = fakeSocket();

    cm.subscribe('feed', ownerSocket, 'author-id');
    cm.subscribe('feed', otherSocket, 'other-id');

    const event: ServerMessage = {
      type: 'post:new',
      channel: 'feed',
      data: buildPostData({ visibility: 'public', authorId: 'author-id' }),
    };

    cm.broadcast('feed', event);

    const expected = JSON.stringify(event);
    expect(
      (ownerSocket as unknown as { send: ReturnType<typeof vi.fn> }).send,
    ).toHaveBeenCalledWith(expected);
    expect(
      (otherSocket as unknown as { send: ReturnType<typeof vi.fn> }).send,
    ).toHaveBeenCalledWith(expected);
  });

  // ── post:updated ────────────────────────────────────────────────────

  it('does NOT send post:updated for a private post to non-owner subscribers', () => {
    const ownerSocket = fakeSocket();
    const nonOwnerSocket = fakeSocket();

    cm.subscribe('feed', ownerSocket, 'author-id');
    cm.subscribe('feed', nonOwnerSocket, 'other-id');

    const event: ServerMessage = {
      type: 'post:updated',
      channel: 'feed',
      data: buildPostData({ visibility: 'private', authorId: 'author-id' }),
    };

    cm.broadcast('feed', event);

    expect(
      (ownerSocket as unknown as { send: ReturnType<typeof vi.fn> }).send,
    ).toHaveBeenCalledOnce();
    expect(
      (nonOwnerSocket as unknown as { send: ReturnType<typeof vi.fn> }).send,
    ).not.toHaveBeenCalled();
  });

  it('sends post:updated for a public post to ALL subscribers', () => {
    const ownerSocket = fakeSocket();
    const otherSocket = fakeSocket();

    cm.subscribe('feed', ownerSocket, 'author-id');
    cm.subscribe('feed', otherSocket, 'other-id');

    const event: ServerMessage = {
      type: 'post:updated',
      channel: 'feed',
      data: buildPostData({ visibility: 'public', authorId: 'author-id' }),
    };

    cm.broadcast('feed', event);

    expect(
      (ownerSocket as unknown as { send: ReturnType<typeof vi.fn> }).send,
    ).toHaveBeenCalledOnce();
    expect(
      (otherSocket as unknown as { send: ReturnType<typeof vi.fn> }).send,
    ).toHaveBeenCalledOnce();
  });

  // ── Edge cases ──────────────────────────────────────────────────────

  it('skips a non-owner subscriber that has no tracked userId (private post)', () => {
    // Subscriber added without userId — defensive: cannot prove ownership ⇒ skip
    const anonSocket = fakeSocket();
    cm.subscribe('feed', anonSocket); // no userId

    const event: ServerMessage = {
      type: 'post:new',
      channel: 'feed',
      data: buildPostData({ visibility: 'private', authorId: 'author-id' }),
    };

    cm.broadcast('feed', event);

    expect(
      (anonSocket as unknown as { send: ReturnType<typeof vi.fn> }).send,
    ).not.toHaveBeenCalled();
  });

  it('does NOT apply the filter to non-feed channels (e.g. comment:new on post:1)', () => {
    const ws1 = fakeSocket();
    const ws2 = fakeSocket();
    cm.subscribe('post:1', ws1, 'user-1');
    cm.subscribe('post:1', ws2, 'user-2');

    const event: ServerMessage = {
      type: 'comment:new',
      channel: 'post:1',
      data: {
        id: 'c1',
        postId: 'post-1',
        author: { id: 'user-1', displayName: 'A', avatarUrl: null },
        parentId: null,
        lineNumber: null,
        revisionId: null,
        revisionNumber: null,
        body: 'hello',
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
    };

    cm.broadcast('post:1', event);

    const expected = JSON.stringify(event);
    expect((ws1 as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      expected,
    );
    expect((ws2 as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledWith(
      expected,
    );
  });

  it('respects excludeWs together with the visibility filter', () => {
    const ownerSocket = fakeSocket();
    const ownerOtherTab = fakeSocket();
    const nonOwnerSocket = fakeSocket();

    cm.subscribe('feed', ownerSocket, 'author-id');
    cm.subscribe('feed', ownerOtherTab, 'author-id');
    cm.subscribe('feed', nonOwnerSocket, 'other-id');

    const event: ServerMessage = {
      type: 'post:new',
      channel: 'feed',
      data: buildPostData({ visibility: 'private', authorId: 'author-id' }),
    };

    // Excluding the originating socket; the other owner-tab still receives it,
    // and non-owner subscribers are filtered out.
    cm.broadcast('feed', event, ownerSocket);

    expect(
      (ownerSocket as unknown as { send: ReturnType<typeof vi.fn> }).send,
    ).not.toHaveBeenCalled();
    expect(
      (ownerOtherTab as unknown as { send: ReturnType<typeof vi.fn> }).send,
    ).toHaveBeenCalledOnce();
    expect(
      (nonOwnerSocket as unknown as { send: ReturnType<typeof vi.fn> }).send,
    ).not.toHaveBeenCalled();
  });

  // ── userId tracking lifecycle ───────────────────────────────────────

  it('drops the userId mapping when unsubscribing', () => {
    const ws = fakeSocket();
    cm.subscribe('feed', ws, 'author-id');
    cm.unsubscribe('feed', ws);

    // Re-subscribe without userId; private-post broadcast should now skip.
    cm.subscribe('feed', ws);
    const event: ServerMessage = {
      type: 'post:new',
      channel: 'feed',
      data: buildPostData({ visibility: 'private', authorId: 'author-id' }),
    };
    cm.broadcast('feed', event);

    expect((ws as unknown as { send: ReturnType<typeof vi.fn> }).send).not.toHaveBeenCalled();
  });

  it('retains the userId mapping when unsubscribing from one channel but still subscribed to another', () => {
    const ws = fakeSocket();
    cm.subscribe('feed', ws, 'author-id');
    cm.subscribe('post:1', ws, 'author-id');

    // Unsubscribe from feed only — still subscribed to post:1, so userId must persist.
    cm.unsubscribe('feed', ws);

    // Re-subscribe to feed without supplying userId; the persisted mapping
    // should still let private-post events through to the author.
    cm.subscribe('feed', ws);
    const event: ServerMessage = {
      type: 'post:new',
      channel: 'feed',
      data: buildPostData({ visibility: 'private', authorId: 'author-id' }),
    };
    cm.broadcast('feed', event);

    expect((ws as unknown as { send: ReturnType<typeof vi.fn> }).send).toHaveBeenCalledOnce();
  });

  it('drops the userId mapping when removeFromAll is called', () => {
    const ws = fakeSocket();
    cm.subscribe('feed', ws, 'author-id');
    cm.subscribe('post:1', ws, 'author-id');

    cm.removeFromAll(ws);

    // Re-subscribe to feed without userId
    cm.subscribe('feed', ws);
    const event: ServerMessage = {
      type: 'post:updated',
      channel: 'feed',
      data: buildPostData({ visibility: 'private', authorId: 'author-id' }),
    };
    cm.broadcast('feed', event);

    expect((ws as unknown as { send: ReturnType<typeof vi.fn> }).send).not.toHaveBeenCalled();
  });
});
