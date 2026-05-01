import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createPostSchema, updatePostSchema, createRevisionSchema } from '@forge/shared';
import { query, withTransaction } from '../db/connection.js';
import {
  findPostById,
  createPost,
  createForkedPost,
  updatePost,
  softDeletePost,
  publishPost,
  findPostWithLatestRevision,
  updateLinkPreview,
} from '../db/queries/posts.js';
import {
  findRevisionsByPostId,
  findRevisionsWithAuthorByPostId,
  findRevision,
  createRevision,
  createRevisionAtomic,
} from '../db/queries/revisions.js';
import { findFilesByRevisionId, createPostFile } from '../db/queries/post-files.js';
import { toPost, toRevision, toPostWithRevision } from '../services/posts.js';
import { syncVariablesFromContent } from '../services/playground.js';
import { permanentKey } from '../services/files.js';
import type { PostFileRow, PostRevisionRow } from '../db/queries/types.js';
import { findFeedPosts, findFeedPostById } from '../db/queries/feed.js';
import { toPostWithAuthor } from '../services/feed.js';
import { findTagByName, createTag, addPostTag } from '../db/queries/tags.js';
import { getExcludeWs } from '../plugins/websocket/broadcast.js';
import { fetchLinkPreview } from '../services/link-preview.js';
import { ContentType } from '@forge/shared';
import { assertCanReadPost } from '../lib/visibility.js';

const feedQuerySchema = z.object({
  sort: z.enum(['trending', 'recent', 'top', 'personalized']).default('recent'),
  // Issue #49: 'subscribed' selects posts whose tags the caller subscribes to.
  filter: z.enum(['mine', 'bookmarked', 'subscribed']).optional(),
  // Issue #49: tag=<name> filters the feed to posts tagged with <name>.
  // min(1) rejects ?tag= (empty string) at the schema layer.
  tag: z.string().min(1).max(50).optional(),
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

    // Fetch link preview for link posts
    let linkPreview = null;
    if (contentType === ContentType.Link && parsed.data.linkUrl) {
      linkPreview = await fetchLinkPreview(parsed.data.linkUrl);
    }

    // For link posts, content is optional — default to linkUrl for the revision.
    // After validation: non-link posts always have content, link posts always have linkUrl.
    const revisionContent = content || (parsed.data.linkUrl as string);

    const postRow = await createPost({
      authorId: userId,
      title,
      contentType,
      language: language ?? null,
      visibility,
      isDraft: isDraft ?? true,
      linkUrl: parsed.data.linkUrl,
      linkPreview: linkPreview ?? undefined,
    });

    const revisionRow = await createRevision({
      postId: postRow.id,
      authorId: userId,
      content: revisionContent,
      message: null,
      revisionNumber: 1,
    });

    // Auto-extract {{vars}} from initial revision content into prompt_variables
    // for prompt posts so the playground UI renders the right inputs without a
    // separate "save variables" round-trip. Non-prompt posts skip this step.
    if (contentType === ContentType.Prompt) {
      await syncVariablesFromContent(postRow.id, revisionContent);
    }

    if (parsed.data.tags && parsed.data.tags.length > 0) {
      for (const tagName of parsed.data.tags) {
        const existing = await findTagByName(tagName);
        const tagId = existing ? existing.id : (await createTag(tagName)).id;
        await addPostTag(postRow.id, tagId);
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
  app.get('/:id', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const row = await findPostWithLatestRevision(id);
    if (!row) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    if (!assertCanReadPost(row, request.user.id, reply)) return;

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
      return reply.status(403).send({ error: 'You can only edit your own posts' });
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
      return reply.status(403).send({ error: 'You can only delete your own posts' });
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
      return reply.status(403).send({ error: 'You can only publish your own posts' });
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

  // POST /:id/refresh-preview — re-fetch link preview for author
  app.post('/:id/refresh-preview', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await findPostById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    if (existing.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'Only the author can refresh the link preview' });
    }

    if (existing.content_type !== ContentType.Link) {
      return reply.status(400).send({ error: 'Only link posts can have their preview refreshed' });
    }

    const linkUrl = existing.link_url as string;
    const preview = await fetchLinkPreview(linkUrl);
    const updatedRow = await updateLinkPreview(id, preview);

    const feedRow = await findFeedPostById(id);
    if (feedRow) {
      app.websocket.channels.broadcast('feed', {
        type: 'post:updated',
        channel: 'feed',
        data: toPostWithAuthor(feedRow),
      });
    }

    return reply.send({ post: toPost(updatedRow) });
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

    // Auto-extract {{vars}} from forked content so the playground UI renders
    // the right inputs for prompt forks. Non-prompt posts skip this step.
    if (source.content_type === ContentType.Prompt) {
      await syncVariablesFromContent(forkedPostRow.id, sourceWithRevision.content);
    }

    // Copy files from source post's latest revision (shared storage_key, no object copy)
    const sourceRevisions = await findRevisionsByPostId(id);
    const latestSourceRevision = sourceRevisions[0];
    if (latestSourceRevision) {
      const sourceFiles = await findFilesByRevisionId(latestSourceRevision.id);
      for (const sourceFile of sourceFiles) {
        await createPostFile({
          postId: forkedPostRow.id,
          revisionId: revisionRow.id,
          filename: sourceFile.filename,
          content: sourceFile.content,
          storageKey: sourceFile.storage_key,
          mimeType: sourceFile.mime_type,
          fileSize: sourceFile.file_size,
          sortOrder: sourceFile.sort_order,
        });
      }
    }

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
  // Optionally accepts stagedFileIds and removeFileIds to commit files with the revision.
  app.post('/:id/revisions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await findPostById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    if (existing.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'You can only add revisions to your own posts' });
    }

    const parsed = createRevisionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .status(400)
        .send({ error: parsed.error.errors.map((e) => e.message).join(', ') });
    }

    const stagedFileIds = parsed.data.stagedFileIds ?? [];
    const removeFileIds = parsed.data.removeFileIds ?? [];
    const hasFileOps =
      parsed.data.stagedFileIds !== undefined || parsed.data.removeFileIds !== undefined;

    // --- Backwards-compatible path: no file operations ---------
    if (!hasFileOps) {
      const revisionRow = await createRevisionAtomic({
        postId: id,
        authorId: request.user.id,
        content: parsed.data.content,
        message: parsed.data.message ?? null,
      });

      // Re-sync prompt_variables when a prompt post's content changes so the
      // playground UI reflects added/removed {{vars}} immediately.
      if (existing.content_type === ContentType.Prompt) {
        await syncVariablesFromContent(id, parsed.data.content);
      }

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
    }

    // --- File-aware path: use withTransaction ------------------
    // Track staging keys for post-transaction cleanup
    const stagingKeysToDelete: string[] = [];
    // Track copied permanent keys for rollback compensation
    const copiedKeys: string[] = [];

    let revisionRow: PostRevisionRow;
    try {
      revisionRow = await withTransaction(async (client) => {
        // 1. Create revision atomically
        const revResult = await client.query<PostRevisionRow>(
          `INSERT INTO post_revisions (post_id, author_id, content, message, revision_number)
           SELECT $1, $2, $3, $4, COALESCE(MAX(revision_number), 0) + 1
           FROM post_revisions WHERE post_id = $1
           RETURNING *`,
          [id, request.user.id, parsed.data.content, parsed.data.message ?? null],
        );
        const rev = revResult.rows[0] as PostRevisionRow;

        // 2. Process staged files
        for (const fileId of stagedFileIds) {
          // Verify file belongs to this post AND is staged (revision_id IS NULL)
          const fileResult = await client.query<PostFileRow>(
            'SELECT * FROM post_files WHERE id = $1 AND post_id = $2 AND revision_id IS NULL',
            [fileId, id],
          );
          const file = fileResult.rows[0];
          if (!file) {
            throw new Error(`Staged file not found: ${fileId}`);
          }

          // Compute permanent key and copy storage object if needed
          let newStorageKey = file.storage_key;
          if (file.storage_key) {
            newStorageKey = permanentKey(id, rev.id, file.filename);
            await app.storage.copy(file.storage_key, newStorageKey);
            copiedKeys.push(newStorageKey);
            stagingKeysToDelete.push(file.storage_key);
          }

          // Update the staged file row: set revision_id and storage_key
          await client.query(
            'UPDATE post_files SET revision_id = $1, storage_key = $2 WHERE id = $3 AND post_id = $4',
            [rev.id, newStorageKey, fileId, id],
          );
        }

        // 3. Carry forward files from previous revision (if any)
        const prevRevResult = await client.query<PostRevisionRow>(
          'SELECT * FROM post_revisions WHERE post_id = $1 AND id != $2 ORDER BY revision_number DESC LIMIT 1',
          [id, rev.id],
        );
        const prevRevision = prevRevResult.rows[0];

        if (prevRevision) {
          const prevFilesResult = await client.query<PostFileRow>(
            'SELECT * FROM post_files WHERE revision_id = $1 ORDER BY sort_order ASC',
            [prevRevision.id],
          );

          const removeSet = new Set(removeFileIds);
          for (const prevFile of prevFilesResult.rows) {
            // Skip files that are being removed
            if (removeSet.has(prevFile.id)) continue;

            // Carry forward: create new post_files row with new revision_id
            await client.query(
              `INSERT INTO post_files (post_id, revision_id, filename, content, storage_key, mime_type, sort_order, file_size)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                prevFile.post_id,
                rev.id,
                prevFile.filename,
                prevFile.content,
                prevFile.storage_key,
                prevFile.mime_type,
                prevFile.sort_order,
                prevFile.file_size,
              ],
            );
          }
        }

        return rev;
      });
    } catch (err) {
      // Compensate: delete any storage objects copied during the failed transaction
      for (const key of copiedKeys) {
        try {
          await app.storage.delete(key);
        } catch {
          // Best-effort
        }
      }
      const message = err instanceof Error ? err.message : 'Transaction failed';
      if (message.startsWith('Staged file not found')) {
        return reply.status(400).send({ error: message });
      }
      throw err;
    }

    // 4. Post-transaction: delete staging storage objects (best-effort)
    for (const key of stagingKeysToDelete) {
      try {
        await app.storage.delete(key);
      } catch {
        // Best-effort: log but don't fail the request
      }
    }

    // Re-sync prompt_variables when a prompt post's content changes so the
    // playground UI reflects added/removed {{vars}} immediately.
    if (existing.content_type === ContentType.Prompt) {
      await syncVariablesFromContent(id, parsed.data.content);
    }

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
  });

  // GET /:id/revisions — list revisions
  app.get('/:id/revisions', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const existing = await findPostById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    if (!assertCanReadPost(existing, request.user.id, reply)) return;

    const rows = await findRevisionsWithAuthorByPostId(id);
    return reply.send({ revisions: rows.map(toRevision) });
  });

  // GET /:id/revisions/:rev — get specific revision
  app.get('/:id/revisions/:rev', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id, rev } = request.params as { id: string; rev: string };

    const revisionNumber = Number(rev);
    if (Number.isNaN(revisionNumber) || !Number.isInteger(revisionNumber) || revisionNumber < 1) {
      return reply.status(400).send({ error: 'Invalid revision number' });
    }

    const existing = await findPostById(id);
    if (!existing) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    if (!assertCanReadPost(existing, request.user.id, reply)) return;

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
        return reply
          .status(403)
          .send({ error: 'You can only restore revisions on your own posts' });
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

      // Re-sync prompt_variables when a prompt post's content changes so the
      // playground UI reflects added/removed {{vars}} immediately.
      if (existing.content_type === ContentType.Prompt) {
        await syncVariablesFromContent(id, targetRevision.content);
      }

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
