import type { FastifyInstance } from 'fastify';
import { voteSchema } from '@forge/shared';
import { findPostById } from '../db/queries/posts.js';
import { getUserVote, upsertVote, deleteVote } from '../db/queries/votes.js';

export async function voteRoutes(app: FastifyInstance): Promise<void> {
  // POST /:id/vote — idempotent toggle
  app.post('/:id/vote', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const parsed = voteSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const { value } = parsed.data;

    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const existing = await getUserVote(request.user.id, id);
    let userVote: number | null;

    if (existing && existing.value === value) {
      // Same value — toggle off (remove vote)
      await deleteVote(request.user.id, id);
      userVote = null;
    } else {
      // No vote or different value — upsert
      const row = await upsertVote(request.user.id, id, value);
      userVote = row.value;
    }

    // Re-read post for updated vote_count (DB trigger has fired)
    const updatedPost = await findPostById(id);
    const voteCount = updatedPost?.vote_count ?? post.vote_count;

    return reply.send({ voteCount, userVote });
  });

  // DELETE /:id/vote — explicit vote removal
  app.delete('/:id/vote', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    const deleted = await deleteVote(request.user.id, id);
    if (!deleted) {
      return reply.status(404).send({ error: 'Vote not found' });
    }

    // Re-read post for updated vote_count (DB trigger has fired)
    const updatedPost = await findPostById(id);
    const voteCount = updatedPost?.vote_count ?? post.vote_count;

    return reply.send({ voteCount, userVote: null });
  });
}
