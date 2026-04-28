import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { buildUserProfile } from '../services/user-profiles.js';

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const paramsSchema = z.object({
  id: z.string().regex(uuidRegex, 'Invalid user ID'),
});

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().optional(),
});

export async function userProfileRoutes(app: FastifyInstance): Promise<void> {
  // GET /:id — public user profile with stats, badges, and paginated posts
  app.get('/:id', async (request, reply) => {
    const paramsParsed = paramsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      return reply
        .status(400)
        .send({ error: paramsParsed.error.errors.map((e) => e.message).join(', ') });
    }

    const queryParsed = querySchema.safeParse(request.query);
    if (!queryParsed.success) {
      return reply
        .status(400)
        .send({ error: queryParsed.error.errors.map((e) => e.message).join(', ') });
    }

    const { id } = paramsParsed.data;
    const { limit, cursor } = queryParsed.data;

    const cursorDate = cursor ? new Date(cursor.split('|')[0] as string) : undefined;

    const profile = await buildUserProfile(id, limit, cursorDate);
    if (!profile) {
      return reply.status(404).send({ error: 'User not found' });
    }

    return reply.send(profile);
  });
}
