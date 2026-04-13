import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { findPostById } from '../db/queries/posts.js';
import { createBookmark, deleteBookmark } from '../db/queries/bookmarks.js';
import { findFeedPosts } from '../db/queries/feed.js';
import { toPostWithAuthor } from '../services/feed.js';

const bookmarkListSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export async function bookmarkRoutes(app: FastifyInstance): Promise<void> {
  // POST /posts/:id/bookmark — toggle bookmark
  app.post('/posts/:id/bookmark', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const userId = request.user.id;

    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const created = await createBookmark(userId, id);
    if (created) {
      return reply.send({ bookmarked: true });
    }

    // Already existed — toggle off
    await deleteBookmark(userId, id);
    return reply.send({ bookmarked: false });
  });

  // GET /bookmarks — paginated list of user's bookmarked posts
  app.get('/bookmarks', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = bookmarkListSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const { cursor, limit } = parsed.data;
    const userId = request.user.id;

    const { posts: rows, hasMore } = await findFeedPosts({
      userId,
      filter: 'bookmarked',
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
}
