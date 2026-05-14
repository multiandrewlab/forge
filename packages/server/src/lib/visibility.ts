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

/**
 * Visibility-before-existence variant of {@link assertCanReadPost}: for
 * private posts owned by someone else, send 404 instead of 403 so the
 * response does not reveal the post's existence. Used by routes whose
 * 200-response body (e.g. cf_uid in a video playback URL) could leak
 * resource identity even when the route name is guessable.
 *
 * Per spec §8.2 (visibility-before-existence).
 */
export function assertCanReadPostStrict(
  post: { visibility: string; author_id: string },
  callerId: string,
  reply: FastifyReply,
): boolean {
  if (post.visibility === 'private' && post.author_id !== callerId) {
    reply.status(404).send({ error: 'Post not found' });
    return false;
  }
  return true;
}
