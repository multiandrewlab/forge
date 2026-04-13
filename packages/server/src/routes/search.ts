import type { FastifyInstance } from 'fastify';
import { searchQuerySchema } from '@forge/shared';
import { searchPostsByTsvector, searchPostsByTrigram, searchUsers } from '../db/queries/search.js';
import { toSearchSnippet, toUserSummary, buildAiActions } from '../services/search.js';
import type { SearchSnippet } from '@forge/shared';
import type { SearchPostRow } from '../db/queries/search.js';

const TRIGRAM_FALLBACK_THRESHOLD = 5;

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/search', async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const { q, type, tag, fuzzy, limit } = parsed.data;
    const trimmedQ = q.trim();

    if (trimmedQ === '') {
      return reply.send({
        snippets: [],
        aiActions: [],
        people: [],
        query: '',
        totalResults: 0,
      });
    }

    try {
      const searchOptions = {
        contentType: type,
        tag,
        limit,
      };

      let snippets: SearchSnippet[];

      if (fuzzy) {
        // Fuzzy mode: skip tsvector, go straight to trigram
        const trigramRows = await searchPostsByTrigram(trimmedQ, searchOptions);
        snippets = trigramRows.map((row) => toSearchSnippet(row, 'trigram'));
      } else {
        // Standard mode: try tsvector first
        const tsvectorRows = await searchPostsByTsvector(trimmedQ, searchOptions);
        snippets = tsvectorRows.map((row) => toSearchSnippet(row, 'tsvector'));

        // Fall back to trigram if not enough results
        if (tsvectorRows.length < TRIGRAM_FALLBACK_THRESHOLD) {
          const trigramRows = await searchPostsByTrigram(trimmedQ, searchOptions);
          const existingIds = new Set<string>(tsvectorRows.map((row: SearchPostRow) => row.id));
          const newTrigramSnippets = trigramRows
            .filter((row) => !existingIds.has(row.id))
            .map((row) => toSearchSnippet(row, 'trigram'));
          snippets = [...snippets, ...newTrigramSnippets];
        }
      }

      const [userRows, aiActions] = await Promise.all([
        searchUsers(trimmedQ, { limit: 5 }),
        Promise.resolve(buildAiActions(trimmedQ)),
      ]);

      const people = userRows.map(toUserSummary);
      const slicedSnippets = snippets.slice(0, limit);

      return reply.send({
        snippets: slicedSnippets,
        aiActions,
        people,
        query: trimmedQ,
        totalResults: slicedSnippets.length + people.length + aiActions.length,
      });
    } catch {
      return reply.status(500).send({ error: 'internal_error' });
    }
  });
}
