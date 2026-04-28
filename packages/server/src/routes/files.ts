import type { FastifyInstance } from 'fastify';
import { isAllowedMimeType } from '@forge/shared';
import { findPostById } from '../db/queries/posts.js';
import {
  createPostFile,
  findFilesByRevisionId,
  findStagedFilesByPostId,
  findStagedFileById,
  getNextSortOrder,
  deleteFileById,
} from '../db/queries/post-files.js';
import { findRevisionsByPostId } from '../db/queries/revisions.js';
import { query } from '../db/connection.js';
import { sanitizeFilename, routeStorage, toPostFile, stagingKey } from '../services/files.js';
import type { PostFileRow } from '../db/queries/types.js';

export async function fileRoutes(app: FastifyInstance): Promise<void> {
  // ─── POST /:id/files — upload file to staging ───────────────────────
  app.post(
    '/:id/files',
    {
      preHandler: [app.authenticate],
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      // 1. Check post exists and user owns it
      const post = await findPostById(id);
      if (!post) {
        return reply.status(404).send({ error: 'Post not found' });
      }
      if (post.author_id !== request.user.id) {
        return reply.status(403).send({ error: 'Forbidden' });
      }

      // 2. Get the uploaded file from multipart
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file uploaded' });
      }

      // 3. Validate MIME type against allowlist
      if (!isAllowedMimeType(data.mimetype)) {
        request.log.info({ event: 'file.upload.rejected', postId: id, reason: 'mime', mimeType: data.mimetype }, 'file upload rejected');
        return reply.status(415).send({ error: 'Unsupported media type' });
      }

      // 4. Consume the file into a buffer
      const buffer = await data.toBuffer();

      // 5. Check if the stream was truncated (file too large)
      if (data.file.truncated) {
        request.log.info({ event: 'file.upload.rejected', postId: id, reason: 'size' }, 'file upload rejected');
        return reply.status(413).send({ error: 'File too large' });
      }

      // 6. For image/* types, verify magic bytes match claimed MIME
      if (data.mimetype.startsWith('image/')) {
        const { fileTypeFromBuffer } = await import('file-type');
        const detected = await fileTypeFromBuffer(buffer);
        if (!detected || detected.mime !== data.mimetype) {
          return reply
            .status(415)
            .send({ error: 'File content does not match declared MIME type' });
        }
      }

      // 7. Sanitize filename
      const filename = sanitizeFilename(data.filename);

      // 8. Determine storage strategy
      const storageMode = routeStorage(buffer.length);
      const sortOrder = await getNextSortOrder(id);

      // 9. Create DB row with revision_id = null (staging)
      const row = await createPostFile({
        postId: id,
        revisionId: null,
        filename,
        content: storageMode === 'inline' ? buffer.toString('utf-8') : null,
        storageKey: null,
        mimeType: data.mimetype,
        sortOrder,
        fileSize: buffer.length,
      });

      // 10. If object storage, upload and update storage_key
      if (storageMode === 'object') {
        const key = stagingKey(request.user.id, row.id, filename);
        try {
          await app.storage.upload(key, buffer, data.mimetype, buffer.length);
          await query('UPDATE post_files SET storage_key = $1 WHERE id = $2', [key, row.id]);
          row.storage_key = key;
        } catch (err) {
          // Compensate: delete the orphan DB row
          await query('DELETE FROM post_files WHERE id = $1 AND post_id = $2', [row.id, id]);
          throw err;
        }
      }

      request.log.info({ event: 'file.upload', postId: id, fileId: row.id, mimeType: data.mimetype, fileSize: buffer.length }, 'file uploaded');
      return reply.status(201).send({ file: toPostFile(row) });
    },
  );

  // ─── GET /:id/files — list files for a revision (or staged) ─────────
  app.get('/:id/files', async (request, reply) => {
    const { id } = request.params as { id: string };
    const { revisionId } = request.query as { revisionId?: string };

    // Check post exists
    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    // Resolve authenticated user (optional — public routes don't require auth)
    let userId: string | undefined;
    try {
      await request.jwtVerify();
      userId = request.user.id;
    } catch {
      // unauthenticated — allowed for public resources
    }

    const isOwner = userId !== undefined && post.author_id === userId;
    const isPublic = post.visibility === 'public' && !post.is_draft;

    let files: PostFileRow[];

    if (!revisionId) {
      // Staged files — only visible to post owner
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (!isOwner) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      files = await findStagedFilesByPostId(id);
    } else if (revisionId === 'latest') {
      // Find the latest revision
      const revisions = await findRevisionsByPostId(id);
      const latestRevision = revisions[0];
      if (!latestRevision) {
        return reply.status(404).send({ error: 'No revisions found' });
      }
      // Authorization: follow post visibility
      if (!isPublic && !isOwner) {
        if (!userId) {
          return reply.status(401).send({ error: 'Unauthorized' });
        }
        return reply.status(403).send({ error: 'Forbidden' });
      }
      files = await findFilesByRevisionId(latestRevision.id);
    } else {
      // Specific revisionId — verify it belongs to this post
      const revisionCheck = await query<{ post_id: string }>(
        'SELECT post_id FROM post_revisions WHERE id = $1',
        [revisionId],
      );
      if (!revisionCheck.rows[0]) {
        return reply.status(404).send({ error: 'Revision not found' });
      }
      if (revisionCheck.rows[0].post_id !== id) {
        return reply.status(404).send({ error: 'Revision does not belong to this post' });
      }
      // Authorization: follow post visibility
      if (!isPublic && !isOwner) {
        if (!userId) {
          return reply.status(401).send({ error: 'Unauthorized' });
        }
        return reply.status(403).send({ error: 'Forbidden' });
      }
      files = await findFilesByRevisionId(revisionId);
    }

    return reply.send({ files: files.map(toPostFile) });
  });

  // ─── GET /:id/files/:fileId — get file content or redirect ─────────
  app.get('/:id/files/:fileId', async (request, reply) => {
    const { id, fileId } = request.params as { id: string; fileId: string };

    // Check post exists
    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }

    // Find the file (either staged or committed)
    const result = await query<PostFileRow>(
      'SELECT * FROM post_files WHERE id = $1 AND post_id = $2',
      [fileId, id],
    );
    const file = result.rows[0];
    if (!file) {
      return reply.status(404).send({ error: 'File not found' });
    }

    // Resolve authenticated user (optional — public routes don't require auth)
    let userId: string | undefined;
    try {
      await request.jwtVerify();
      userId = request.user.id;
    } catch {
      // unauthenticated — allowed for public resources
    }

    const isOwner = userId !== undefined && post.author_id === userId;
    const isPublic = post.visibility === 'public' && !post.is_draft;

    if (file.revision_id === null) {
      // Staged file — only visible to post owner
      if (!userId) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      if (!isOwner) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
    } else {
      // Committed file — follow post visibility
      if (!isPublic && !isOwner) {
        if (!userId) {
          return reply.status(401).send({ error: 'Unauthorized' });
        }
        return reply.status(403).send({ error: 'Forbidden' });
      }
    }

    // Inline file: return content directly
    if (file.content !== null) {
      return reply
        .header('Content-Type', file.mime_type ?? 'application/octet-stream')
        .header('X-Content-Type-Options', 'nosniff')
        .header('Content-Disposition', `inline; filename="${file.filename}"`)
        .send(file.content);
    }

    // Object-stored file: redirect to signed URL
    if (file.storage_key) {
      const url = await app.storage.getSignedUrl(file.storage_key);
      return reply.code(302).redirect(url);
    }

    return reply.status(404).send({ error: 'File content not available' });
  });

  // ─── DELETE /:id/files/:fileId — delete staged file ─────────────────
  app.delete('/:id/files/:fileId', { preHandler: [app.authenticate] }, async (request, reply) => {
    const { id, fileId } = request.params as { id: string; fileId: string };

    // Check post exists and user owns it
    const post = await findPostById(id);
    if (!post) {
      return reply.status(404).send({ error: 'Post not found' });
    }
    if (post.author_id !== request.user.id) {
      return reply.status(403).send({ error: 'Forbidden' });
    }

    // Find the staged file
    const file = await findStagedFileById(fileId, id);
    if (!file) {
      return reply.status(404).send({ error: 'File not found' });
    }

    // Delete from object storage first (if applicable)
    if (file.storage_key) {
      await app.storage.delete(file.storage_key);
    }

    // Delete from DB
    await deleteFileById(fileId, id);

    request.log.info({ event: 'file.delete', postId: id, fileId }, 'file deleted');
    return reply.status(204).send();
  });
}
