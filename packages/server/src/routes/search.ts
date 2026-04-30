import type { FastifyInstance } from 'fastify';
import { searchQuerySchema } from '@forge/shared';
import type { AiSearchFilters, ContentType } from '@forge/shared';
import {
  searchPostsByTsvector,
  searchPostsByTrigram,
  searchUsers,
  countSearchPosts,
} from '../db/queries/search.js';
import { toSearchSnippet, toUserSummary, buildAiActions } from '../services/search.js';
import { createSearchChain, runSearchChain } from '../plugins/langchain/chains/search.js';
import type { SearchSnippet } from '@forge/shared';
import type { SearchPostRow, SearchPostOptions } from '../db/queries/search.js';

const TRIGRAM_FALLBACK_THRESHOLD = 5;

export async function searchRoutes(app: FastifyInstance): Promise<void> {
  app.get('/search', { preHandler: [app.authenticate] }, async (request, reply) => {
    const parsed = searchQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const { q, type, tag, fuzzy, ai, limit, author, since, page } = parsed.data;
    const trimmedQ = q.trim();

    if (trimmedQ === '') {
      return reply.send({
        snippets: [],
        aiActions: [],
        people: [],
        query: '',
        totalResults: 0,
        page: 1,
        totalPages: 0,
      });
    }

    try {
      let searchOptions: SearchPostOptions = {
        contentType: type,
        tag,
        limit,
        author,
        since,
        page,
      };
      let effectiveQuery = trimmedQ;
      let aiFilters: AiSearchFilters | undefined;
      let aiResolvedFilters: { tag?: string; type?: ContentType } | undefined;

      // AI resolution only happens on page 1 — subsequent pages reuse the
      // resolved filters via URL params (the client must rewrite the URL).
      if (ai === true && page === 1) {
        // preHandler [app.authenticate] guarantees request.user is defined.
        // Try to acquire a rate-limit slot — if not available, fall back to plain search.
        const slot = app.aiAcquire(request.user.id);
        if (slot) {
          // Run the AI chain — any failure gracefully falls back to plain search
          try {
            const chain = createSearchChain(app.aiProvider());
            const filters = await runSearchChain(chain, trimmedQ);
            if (filters !== null) {
              aiFilters = filters;
              effectiveQuery = filters.textQuery;
              const resolvedTag = filters.tags[0];
              const resolvedType = (filters.contentType as ContentType | null) ?? undefined;
              searchOptions = {
                contentType: resolvedType,
                tag: resolvedTag,
                limit,
                author,
                since,
                page,
              };
              if (resolvedTag !== undefined || resolvedType !== undefined) {
                aiResolvedFilters = {
                  ...(resolvedTag !== undefined && { tag: resolvedTag }),
                  ...(resolvedType !== undefined && { type: resolvedType }),
                };
              }
            }
          } catch {
            // Chain error: fall back to original query and options
          } finally {
            slot.release();
          }
        }
      }

      let snippets: SearchSnippet[];

      if (fuzzy) {
        // Fuzzy mode: skip tsvector, go straight to trigram
        const trigramRows = await searchPostsByTrigram(effectiveQuery, searchOptions);
        snippets = trigramRows.map((row) => toSearchSnippet(row, 'trigram'));
      } else {
        // Standard mode: try tsvector first
        const tsvectorRows = await searchPostsByTsvector(effectiveQuery, searchOptions);
        snippets = tsvectorRows.map((row) => toSearchSnippet(row, 'tsvector'));

        // Fall back to trigram top-up only on page=1 — pagination uses tsvector as
        // the canonical paginated path so the trigram top-up would corrupt OFFSET.
        if (page === 1 && tsvectorRows.length < TRIGRAM_FALLBACK_THRESHOLD) {
          const trigramRows = await searchPostsByTrigram(effectiveQuery, searchOptions);
          const existingIds = new Set<string>(tsvectorRows.map((row: SearchPostRow) => row.id));
          const newTrigramSnippets = trigramRows
            .filter((row) => !existingIds.has(row.id))
            .map((row) => toSearchSnippet(row, 'trigram'));
          snippets = [...snippets, ...newTrigramSnippets];
        }
      }

      // Compute totalPages from the primary query path's WHERE clause. Count is
      // page-independent — pass page=1 to avoid an extra OFFSET round-trip.
      const totalCount = await countSearchPosts(effectiveQuery, {
        contentType: searchOptions.contentType,
        tag: searchOptions.tag,
        limit: searchOptions.limit,
        author,
        since,
      });
      const totalPages = Math.max(0, Math.ceil(totalCount / limit));

      // Server-side clamp: requesting page > totalPages returns empty snippets but
      // echoes the clamped page so the client can update its URL.
      const clampedPage = totalPages > 0 ? Math.min(page, totalPages) : 1;
      const overflow = totalPages > 0 && page > totalPages;
      const slicedSnippets = overflow ? [] : snippets.slice(0, limit);

      const [userRows, aiActions] = await Promise.all([
        searchUsers(trimmedQ, { limit: 5 }),
        Promise.resolve(buildAiActions(trimmedQ, aiFilters)),
      ]);

      const people = userRows.map(toUserSummary);

      return reply.send({
        snippets: slicedSnippets,
        aiActions,
        people,
        query: trimmedQ,
        totalResults: slicedSnippets.length + people.length + aiActions.length,
        page: clampedPage,
        totalPages,
        ...(aiResolvedFilters && { aiResolvedFilters }),
      });
    } catch {
      return reply.status(500).send({ error: 'internal_error' });
    }
  });
}
