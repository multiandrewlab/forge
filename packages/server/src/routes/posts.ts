import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createPostSchema, updatePostSchema, createRevisionSchema } from '@forge/shared';
import { query } from '../db/connection.js';
import {
  findPostById,
  createPost,
  createForkedPost,
  updatePost,
  softDeletePost,
  publishPost,
  findPostWithLatestRevision,
} from '../db/queries/posts.js';
import {
  findRevisionsWithAuthorByPostId,
  findRevision,
  createRevision,
  createRevisionAtomic,
} from '../db/queries/revisions.js';
import { toPost, toRevision, toPostWithRevision } from '../services/posts.js';
import { findFeedPosts, findFeedPostById } from '../db/queries/feed.js';
import { toPostWithAuthor } from '../services/feed.js';
import { findTagByName, createTag, addPostTag } from '../db/queries/tags.js';
import { getExcludeWs } from '../plugins/websocket/broadcast.js';

const feedQuerySchema = z.object({
  sort: z.enum(['trending', 'recent', 'top', 'personalized']).default('recent'),
  filter: z.enum(['mine', 'bookmarked']).optional(),
  tag: z.string().max(50).optional(),
  type: z.enum(['snippet', 'prompt', 'document', 'link']).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function postRoutes(app: FastifyInstance): Promise<void> {
  // POST / — create post + initial revision
  app.post('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = createPostSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const userId = request.user.id;
    const { title, contentType, language, visibility, content, isDraft } = parsed.data;

    const postRow = await createPost({
      authorId: userId,
      title,
      contentType,
      language: language ?? null,
      visibility,
      isDraft: isDraft ?? true,
    });

    const revisionRow = await createRevision({
      postId: postRow.id,
      authorId: userId,
      content,
      message: null,
      revisionNumber: 1,
    });

    if (parsed.data.tags && parsed.data.tags.length > 0) {
      for (const tagName of parsed.data.tags) {
        let tag = await findTagByName(tagName);
        if (!tag) {
          tag = await createTag(tagName);
        }
        await addPostTag(postRow.id, tag.id);
      }
    }

    // Broadcast post:new on the feed channel
    const feedRow = await findFeedPostById(postRow.id);
    if (feedRow) {
      const excludeWs = getExcludeWs(app, request);
      app.websocket.channels.broadcast(
        'feed',
        { type: 'post:new', channel: 'feed', data: toPostWithAuthor(feedRow) },
        excludeWs,
      );
    }

    return reply.status(201).send({
      post: toPost(postRow),
      revision: toRevision(revisionRow),
    });
  });

  // GET / — feed (must be registered BEFORE /:id)
  app.get('/', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = feedQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const { sort, filter, tag, type, cursor, limit } = parsed.data;
    const userId = request.user.id;

    const { posts: rows, hasMore } = await findFeedPosts({
      userId,
      sort,
      filter,
      tag,
      type,
      cursor,
      limit,
    });

    const lastRow = rows.at(-1);
    const nextCursor =
      hasMore && lastRow
        ? Buffer.from(
            JSON.stringify({ createdAt: lastRow.created_at.toISOString(), id: lastRow.id }),
          ).toString('base64')
        : null;

    return reply.send({
      posts: rows.map(toPostWithAuthor),
      cursor: nextCursor,
    });
  });

  // GET /:id — post + latest revision
  app.get('/:id', async (request, reply) => {
    const { id } = request.params as { id: string };

    const row = await findPostWithLatestRevision(id);
    if (!row) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    return reply.send({ post: toPostWithRevision(row) });
  });

  // PATCH /:id — update metadata only (ownership check)
  app.patch('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await findPostById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    if (existing.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const parsed = updatePostSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const updatedRow = await updatePost(id, parsed.data);
    if (!updatedRow) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    // Broadcast post:updated on the feed channel
    const feedRow = await findFeedPostById(id);
    if (feedRow) {
      const excludeWs = getExcludeWs(app, request);
      app.websocket.channels.broadcast(
        'feed',
        { type: 'post:updated', channel: 'feed', data: toPostWithAuthor(feedRow) },
        excludeWs,
      );
    }

    return reply.send({ post: toPost(updatedRow) });
  });

  // DELETE /:id — soft delete (ownership check)
  app.delete('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await findPostById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    if (existing.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    await softDeletePost(id);
    // Soft-delete does NOT broadcast on the feed channel — clients invalidate
    // via cache expiration or a separate feed-refresh mechanism.
    return reply.status(204).send();
  });

  // POST /:id/publish — set is_draft=false (ownership check)
  app.post('/:id/publish', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await findPostById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    if (existing.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const publishedRow = await publishPost(id);
    if (!publishedRow) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    // Broadcast post:updated on the feed channel (draft → published transition)
    const feedRow = await findFeedPostById(id);
    if (feedRow) {
      const excludeWs = getExcludeWs(app, request);
      app.websocket.channels.broadcast(
        'feed',
        { type: 'post:updated', channel: 'feed', data: toPostWithAuthor(feedRow) },
        excludeWs,
      );
    }

    return reply.send({ post: toPost(publishedRow) });
  });

  // POST /:id/fork — fork a public post
  app.post('/:id/fork', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const source = await findPostById(id);
    if (!source) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    if (source.author_id === request.user.id) {
      return reply.status(403).send({ error: 'Cannot fork your own post' });
    }

    if (source.visibility !== 'public' || source.is_draft) {
      return reply.status(403).send({ error: 'Cannot fork a private post' });
    }

    // Get latest revision content
    const sourceWithRevision = await findPostWithLatestRevision(id);
    if (!sourceWithRevision) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    // Create forked post
    const forkedPostRow = await createForkedPost({
      authorId: request.user.id,
      title: source.title,
      contentType: source.content_type,
      language: source.language,
      visibility: 'private',
      isDraft: true,
      forkedFromId: id,
    });

    // Create initial revision with source content
    const revisionRow = await createRevision({
      postId: forkedPostRow.id,
      authorId: request.user.id,
      content: sourceWithRevision.content,
      message: `Forked from ${source.title}`,
      revisionNumber: 1,
    });

    // Copy tags from source
    const tagRows = await query<{ tag_id: string }>(
      'SELECT tag_id FROM post_tags WHERE post_id = $1',
      [id],
    );
    for (const { tag_id } of tagRows.rows) {
      await addPostTag(forkedPostRow.id, tag_id);
    }

    // Broadcast new post to feed
    const feedRow = await findFeedPostById(forkedPostRow.id);
    if (feedRow) {
      const excludeWs = getExcludeWs(app, request);
      app.websocket.channels.broadcast(
        'feed',
        { type: 'post:new', channel: 'feed', data: toPostWithAuthor(feedRow) },
        excludeWs,
      );
    }

    return reply.status(201).send({
      post: toPost(forkedPostRow),
      revision: toRevision(revisionRow),
    });
  });

  // POST /:id/revisions — create revision using createRevisionAtomic (ownership check)
  app.post('/:id/revisions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await findPostById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    if (existing.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    const parsed = createRevisionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const revisionRow = await createRevisionAtomic({
      postId: id,
      authorId: request.user.id,
      content: parsed.data.content,
      message: parsed.data.message ?? null,
    });

    const revisionData = toRevision(revisionRow);

    const excludeWs = getExcludeWs(app, request);
    app.websocket.channels.broadcast(
      `post:${id}`,
      { type: 'revision:new', channel: `post:${id}`, data: revisionData },
      excludeWs,
    );

    // Also broadcast post:updated on the feed channel (latest revision changed)
    const feedRow = await findFeedPostById(id);
    if (feedRow) {
      app.websocket.channels.broadcast(
        'feed',
        { type: 'post:updated', channel: 'feed', data: toPostWithAuthor(feedRow) },
        excludeWs,
      );
    }

    return reply.status(201).send({ revision: revisionData });
  });

  // GET /:id/revisions — list revisions
  app.get('/:id/revisions', async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await findPostById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const rows = await findRevisionsWithAuthorByPostId(id);
    return reply.send({ revisions: rows.map(toRevision) });
  });

  // GET /:id/revisions/:rev — get specific revision
  app.get('/:id/revisions/:rev', async (request, reply) => {
    const { id, rev } = request.params as { id: string; rev: string };

    const revisionNumber = Number(rev);
    if (Number.isNaN(revisionNumber) || !Number.isInteger(revisionNumber) || revisionNumber < 1) {
      return reply.status(400).send({ error: 'Invalid revision number' });
    }

    const existing = await findPostById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const revisionRow = await findRevision(id, revisionNumber);
    if (!revisionRow) {
      return reply.status(404).send({ error: 'Revision not found' });
    }

    return reply.send({ revision: toRevision(revisionRow) });
  });

  // POST /:id/revisions/:rev/restore — restore a previous revision
  app.post(
    '/:id/revisions/:rev/restore',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const { id, rev } = request.params as { id: string; rev: string };

      const revisionNumber = Number(rev);
      if (Number.isNaN(revisionNumber) || !Number.isInteger(revisionNumber) || revisionNumber < 1) {
        return reply.status(400).send({ error: 'Invalid revision number' });
      }

      const existing = await findPostById(id);
      if (!existing) {
        return reply.status(404).send({ error: 'Post not found' });
      }

      if (existing.author_id !== request.user.id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      const targetRevision = await findRevision(id, revisionNumber);
      if (!targetRevision) {
        return reply.status(404).send({ error: 'Revision not found' });
      }

      const revisionRow = await createRevisionAtomic({
        postId: id,
        authorId: request.user.id,
        content: targetRevision.content,
        message: `Restored from revision ${revisionNumber}`,
      });

      const revisionData = toRevision(revisionRow);

      const excludeWs = getExcludeWs(app, request);
      app.websocket.channels.broadcast(
        `post:${id}`,
        { type: 'revision:new', channel: `post:${id}`, data: revisionData },
        excludeWs,
      );

      const feedRow = await findFeedPostById(id);
      if (feedRow) {
        app.websocket.channels.broadcast(
          'feed',
          { type: 'post:updated', channel: 'feed', data: toPostWithAuthor(feedRow) },
          excludeWs,
        );
      }

      return reply.status(201).send({ revision: revisionData });
    },
  );
}
