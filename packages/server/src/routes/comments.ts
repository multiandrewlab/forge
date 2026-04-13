import type { FastifyInstance } from 'fastify';
import { createCommentSchema, updateCommentSchema } from '@forge/shared';
import { findPostById } from '../db/queries/posts.js';
import {
  findCommentsByPostIdWithAuthor,
  findCommentsByPostIdWithAuthorForRevision,
  findCommentById,
  createComment,
  updateComment,
  deleteComment,
} from '../db/queries/comments.js';
import { toComment } from '../services/comments.js';
import type { CommentWithAuthorRow } from '../db/queries/types.js';
import { getExcludeWs } from '../plugins/websocket/broadcast.js';

export async function commentRoutes(app: FastifyInstance): Promise<void> {
  // GET /:id/comments — public, no auth required
  app.get('/:id/comments', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { revision } = request.query as { revision?: string };

    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const rows = revision
      ? await findCommentsByPostIdWithAuthorForRevision(id, revision)
      : await findCommentsByPostIdWithAuthor(id);

    return reply.send({ comments: rows.map(toComment) });
  });

  // POST /:id/comments — authenticated
  app.post('/:id/comments', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const parsed = createCommentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const raw = await createComment({
      postId: id,
      authorId: request.user.id,
      parentId: parsed.data.parentId ?? null,
      lineNumber: parsed.data.lineNumber ?? null,
      revisionId: parsed.data.revisionId ?? null,
      body: parsed.data.body,
    });

    // Re-read with author join for the response
    const rows = await findCommentsByPostIdWithAuthor(id);
    const created = rows.find((r) => r.id === raw.id);

    const commentData = created
      ? toComment(created)
      : toComment({
          ...raw,
          author_display_name: null,
          author_avatar_url: null,
          revision_number: null,
        } satisfies CommentWithAuthorRow);

    const excludeWs = getExcludeWs(app, request);
    app.websocket.channels.broadcast(
      `post:${id}`,
      { type: 'comment:new', channel: `post:${id}`, data: commentData },
      excludeWs,
    );

    return reply.status(201).send({ comment: commentData });
  });

  // PATCH /:id/comments/:cid — authenticated, ownership check
  app.patch('/:id/comments/:cid', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id, cid } = request.params as { id: string; cid: string };

    const parsed = updateCommentSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const existing = await findCommentById(cid);
    if (!existing) {
      return reply.status(404).send({ error: 'Comment not found' });
    }

    if (existing.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'Not authorized to edit this comment' });
    }

    await updateComment(cid, parsed.data.body);

    // Re-read with author join for the response
    const rows = await findCommentsByPostIdWithAuthor(id);
    const updated = rows.find((r) => r.id === cid);

    const commentData = updated
      ? toComment(updated)
      : toComment({
          ...existing,
          body: parsed.data.body,
          author_display_name: null,
          author_avatar_url: null,
          revision_number: null,
        } satisfies CommentWithAuthorRow);

    const excludeWs = getExcludeWs(app, request);
    app.websocket.channels.broadcast(
      `post:${id}`,
      { type: 'comment:updated', channel: `post:${id}`, data: commentData },
      excludeWs,
    );

    return reply.send({ comment: commentData });
  });

  // DELETE /:id/comments/:cid — authenticated, ownership check
  app.delete('/:id/comments/:cid', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id, cid } = request.params as { id: string; cid: string };

    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const existing = await findCommentById(cid);
    if (!existing) {
      return reply.status(404).send({ error: 'Comment not found' });
    }

    if (existing.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'Not authorized to delete this comment' });
    }

    await deleteComment(cid);

    const excludeWs = getExcludeWs(app, request);
    app.websocket.channels.broadcast(
      `post:${id}`,
      { type: 'comment:deleted', channel: `post:${id}`, data: { id: cid } },
      excludeWs,
    );

    return reply.status(204).send();
  });
}
