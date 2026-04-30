import { describe, it, expect } from 'vitest';
import type { PostFile } from '../../types/file';
import type { PostWithRevision } from '../../types/post';

// ---------------------------------------------------------------------------
// PostFile type shape
// ---------------------------------------------------------------------------
describe('PostFile', () => {
  it('should have all required fields', () => {
    const file: PostFile = {
      id: 'file-1',
      postId: 'post-1',
      revisionId: 'rev-1',
      filename: 'main.ts',
      mimeType: 'text/typescript',
      fileSize: 1024,
      sortOrder: 0,
      createdAt: new Date(),
    };
    expect(file.id).toBe('file-1');
    expect(file.postId).toBe('post-1');
    expect(file.revisionId).toBe('rev-1');
    expect(file.filename).toBe('main.ts');
    expect(file.mimeType).toBe('text/typescript');
    expect(file.fileSize).toBe(1024);
    expect(file.sortOrder).toBe(0);
    expect(file.createdAt).toBeInstanceOf(Date);
  });

  it('should allow null revisionId', () => {
    const file: PostFile = {
      id: 'file-2',
      postId: 'post-1',
      revisionId: null,
      filename: 'readme.md',
      mimeType: 'text/markdown',
      fileSize: 256,
      sortOrder: 1,
      createdAt: new Date(),
    };
    expect(file.revisionId).toBeNull();
  });

  it('should allow null mimeType', () => {
    const file: PostFile = {
      id: 'file-3',
      postId: 'post-1',
      revisionId: null,
      filename: 'data.bin',
      mimeType: null,
      fileSize: 512,
      sortOrder: 0,
      createdAt: new Date(),
    };
    expect(file.mimeType).toBeNull();
  });

  it('should allow null fileSize', () => {
    const file: PostFile = {
      id: 'file-4',
      postId: 'post-1',
      revisionId: 'rev-1',
      filename: 'config.json',
      mimeType: 'application/json',
      fileSize: null,
      sortOrder: 0,
      createdAt: new Date(),
    };
    expect(file.fileSize).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PostWithRevision extended with optional files
// ---------------------------------------------------------------------------
describe('PostWithRevision with files', () => {
  const basePost: PostWithRevision = {
    id: 'post-1',
    authorId: 'user-1',
    title: 'My Post',
    contentType: 'snippet',
    language: 'typescript',
    visibility: 'public',
    isDraft: false,
    forkedFromId: null,
    linkUrl: null,
    linkPreview: null,
    voteCount: 5,
    viewCount: 100,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    revisions: [],
    tags: [],
  };

  it('should allow PostWithRevision without files (backward compatible)', () => {
    const post: PostWithRevision = { ...basePost };
    expect(post.files).toBeUndefined();
  });

  it('should allow PostWithRevision with files array', () => {
    const post: PostWithRevision = {
      ...basePost,
      files: [
        {
          id: 'file-1',
          postId: 'post-1',
          revisionId: 'rev-1',
          filename: 'index.ts',
          mimeType: 'text/typescript',
          fileSize: 1024,
          sortOrder: 0,
          createdAt: new Date(),
        },
      ],
    };
    expect(post.files).toHaveLength(1);
    const firstFile = post.files?.[0];
    expect(firstFile).toBeDefined();
    if (firstFile) {
      expect(firstFile.filename).toBe('index.ts');
    }
  });

  it('should allow PostWithRevision with empty files array', () => {
    const post: PostWithRevision = {
      ...basePost,
      files: [],
    };
    expect(post.files).toHaveLength(0);
  });
});
