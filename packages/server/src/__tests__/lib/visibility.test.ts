import { describe, it, expect, vi } from 'vitest';
import type { FastifyReply } from 'fastify';
import { assertCanReadPost } from '../../lib/visibility.js';

function makeReply() {
  const send = vi.fn();
  const status = vi.fn().mockReturnValue({ send });
  return {
    reply: { status, send } as unknown as FastifyReply,
    status,
    send,
  };
}

describe('assertCanReadPost', () => {
  const ownerId = 'a0000000-0000-0000-0000-000000000001';
  const otherId = 'a0000000-0000-0000-0000-000000000002';

  it('returns true for a public post (no reply sent)', () => {
    const { reply, status, send } = makeReply();
    const post = { visibility: 'public' as const, author_id: ownerId };

    const allowed = assertCanReadPost(post, otherId, reply);

    expect(allowed).toBe(true);
    expect(status).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('returns true for a private post when caller is the author (no reply sent)', () => {
    const { reply, status, send } = makeReply();
    const post = { visibility: 'private' as const, author_id: ownerId };

    const allowed = assertCanReadPost(post, ownerId, reply);

    expect(allowed).toBe(true);
    expect(status).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it('returns false and sends 403 when caller is not the author of a private post', () => {
    const { reply, status, send } = makeReply();
    const post = { visibility: 'private' as const, author_id: ownerId };

    const allowed = assertCanReadPost(post, otherId, reply);

    expect(allowed).toBe(false);
    expect(status).toHaveBeenCalledWith(403);
    expect(send).toHaveBeenCalledWith({ error: 'This post is private' });
  });
});
