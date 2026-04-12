import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  searchTags,
  findPopularTags,
  getUserSubscriptions,
  findTagById,
  subscribeToTag,
  unsubscribeFromTag,
} from '../db/queries/tags.js';
import type { TagRow } from '../db/queries/types.js';

const searchSchema = z.object({
  q: z.string().max(50).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

const popularSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});

function toTag(row: TagRow): { id: string; name: string; postCount: number } {
  return {
    id: row.id,
    name: row.name,
    postCount: row.post_count,
  };
}

export async function tagRoutes(app: FastifyInstance): Promise<void> {
  // GET / — list/search tags (accepts ?q=prefix&limit=N), no auth required
  app.get('/', async (request, reply) => {
    const parsed = searchSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const { q, limit } = parsed.data;
    const rows = await searchTags(q ?? '', limit);
    return reply.send({ tags: rows.map(toTag) });
  });

  // GET /popular — top tags by post_count (accepts ?limit=N), no auth required
  app.get('/popular', async (request, reply) => {
    const parsed = popularSchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const { limit } = parsed.data;
    const rows = await findPopularTags(limit);
    return reply.send({ tags: rows.map(toTag) });
  });

  // GET /subscriptions — user's subscribed tags, requires auth
  app.get('/subscriptions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const rows = await getUserSubscriptions(request.user.id);
    return reply.send({ tags: rows.map(toTag) });
  });

  // POST /:id/subscribe — subscribe to tag, requires auth
  app.post('/:id/subscribe', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const tag = await findTagById(id);
    if (!tag) {
      return reply.status(404).send({ error: 'Tag not found' });
    }

    const inserted = await subscribeToTag(request.user.id, id);
    if (inserted) {
      return reply.status(201).send({ subscribed: true });
    }
    return reply.status(200).send({ subscribed: true });
  });

  // DELETE /:id/subscribe — unsubscribe, requires auth, 404 if not subscribed
  app.delete('/:id/subscribe', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const deleted = await unsubscribeFromTag(request.user.id, id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Not subscribed to this tag' });
    }
    return reply.status(204).send();
  });
}
