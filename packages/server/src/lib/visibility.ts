import type { FastifyReply } from 'fastify';

/**
 * Enforce read-visibility on a post for the calling user.
 *
 * Caller MUST `return` early after a `false` result, or the route handler
 * will send a second reply (Fastify will throw):
 *
 *   if (!assertCanReadPost(post, request.user.id, reply)) return;
 */
export function assertCanReadPost(
  post: { visibility: string; author_id: string },
  callerId: string,
  reply: FastifyReply,
): boolean {
  if (post.visibility === 'private' && post.author_id !== callerId) {
    reply.status(403).send({ error: 'This post is private' });
    return false;
  }
  return true;
}
