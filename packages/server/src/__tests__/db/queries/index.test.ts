import { describe, it, expect } from 'vitest';
import * as queries from '../../../db/queries/index.js';

describe('queries barrel export', () => {
  it('exports user query functions', () => {
    expect(queries.findUserById).toBeTypeOf('function');
    expect(queries.findUserByEmail).toBeTypeOf('function');
    expect(queries.createUser).toBeTypeOf('function');
  });

  it('exports post query functions', () => {
    expect(queries.findPostById).toBeTypeOf('function');
    expect(queries.createPost).toBeTypeOf('function');
  });

  it('exports revision query functions', () => {
    expect(queries.findRevisionsByPostId).toBeTypeOf('function');
    expect(queries.findRevision).toBeTypeOf('function');
    expect(queries.createRevision).toBeTypeOf('function');
  });

  it('exports tag query functions', () => {
    expect(queries.findTagByName).toBeTypeOf('function');
    expect(queries.createTag).toBeTypeOf('function');
    expect(queries.addPostTag).toBeTypeOf('function');
    expect(queries.removePostTag).toBeTypeOf('function');
  });

  it('exports comment, vote, bookmark query functions', () => {
    expect(queries.findCommentsByPostId).toBeTypeOf('function');
    expect(queries.createComment).toBeTypeOf('function');
    expect(queries.upsertVote).toBeTypeOf('function');
    expect(queries.deleteVote).toBeTypeOf('function');
    expect(queries.createBookmark).toBeTypeOf('function');
    expect(queries.deleteBookmark).toBeTypeOf('function');
  });

  it('exports post file and prompt variable query functions', () => {
    expect(queries.findFilesByRevisionId).toBeTypeOf('function');
    expect(queries.createPostFile).toBeTypeOf('function');
    expect(queries.findPromptVariablesByPostId).toBeTypeOf('function');
    expect(queries.createPromptVariable).toBeTypeOf('function');
  });
});
