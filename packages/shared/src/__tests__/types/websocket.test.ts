import { describe, it, expect } from 'vitest';
import {
  authMessageSchema,
  subscribeMessageSchema,
  unsubscribeMessageSchema,
  presenceMessageSchema,
  clientMessageSchema,
  authOkMessageSchema,
  authErrorMessageSchema,
  authExpiredMessageSchema,
  commentNewMessageSchema,
  commentUpdatedMessageSchema,
  commentDeletedMessageSchema,
  voteUpdatedMessageSchema,
  revisionNewMessageSchema,
  presenceUpdateMessageSchema,
  postNewMessageSchema,
  postUpdatedMessageSchema,
  serverMessageSchema,
} from '../../types/websocket.js';
import type {
  AuthMessage,
  SubscribeMessage,
  UnsubscribeMessage,
  PresenceMessage,
  ClientMessage,
  AuthOkMessage,
  AuthErrorMessage,
  AuthExpiredMessage,
  CommentNewMessage,
  CommentUpdatedMessage,
  CommentDeletedMessage,
  VoteUpdatedMessage,
  RevisionNewMessage,
  PresenceUpdateMessage,
  PostNewMessage,
  PostUpdatedMessage,
  ServerMessage,
} from '../../types/websocket.js';

// ── helpers ──────────────────────────────────────────────────────────

const validComment = {
  id: 'c1',
  postId: 'p1',
  author: { id: 'u1', displayName: 'Alice', avatarUrl: null },
  parentId: null,
  lineNumber: null,
  revisionId: null,
  revisionNumber: null,
  body: 'hello',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const validPostRevision = {
  id: 'r1',
  postId: 'p1',
  content: '# Hello',
  message: null,
  revisionNumber: 1,
  createdAt: '2026-01-01T00:00:00Z',
};

const validUser = {
  id: 'u1',
  email: 'alice@test.com',
  displayName: 'Alice',
  avatarUrl: null,
  authProvider: 'github',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const validPostWithAuthor = {
  id: 'p1',
  authorId: 'u1',
  title: 'My Post',
  contentType: 'markdown',
  language: null,
  visibility: 'public',
  isDraft: false,
  forkedFromId: null,
  linkUrl: null,
  linkPreview: null,
  voteCount: 0,
  viewCount: 0,
  deletedAt: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  author: { id: 'u1', displayName: 'Alice', avatarUrl: null },
  tags: ['typescript'],
};

// ── Client → Server schemas ─────────────────────────────────────────

describe('authMessageSchema', () => {
  it('accepts valid auth message', () => {
    const result = authMessageSchema.safeParse({ type: 'auth', token: 'jwt123' });
    expect(result.success).toBe(true);
  });

  it('rejects missing token', () => {
    const result = authMessageSchema.safeParse({ type: 'auth' });
    expect(result.success).toBe(false);
  });

  it('rejects wrong type', () => {
    const result = authMessageSchema.safeParse({ type: 'subscribe', token: 'jwt123' });
    expect(result.success).toBe(false);
  });

  it('rejects empty token', () => {
    const result = authMessageSchema.safeParse({ type: 'auth', token: '' });
    expect(result.success).toBe(false);
  });
});

describe('subscribeMessageSchema', () => {
  it('accepts valid subscribe message', () => {
    const result = subscribeMessageSchema.safeParse({ type: 'subscribe', channel: 'post:abc' });
    expect(result.success).toBe(true);
  });

  it('rejects missing channel', () => {
    const result = subscribeMessageSchema.safeParse({ type: 'subscribe' });
    expect(result.success).toBe(false);
  });

  it('rejects wrong type', () => {
    const result = subscribeMessageSchema.safeParse({ type: 'auth', channel: 'post:abc' });
    expect(result.success).toBe(false);
  });

  it('rejects empty channel', () => {
    const result = subscribeMessageSchema.safeParse({ type: 'subscribe', channel: '' });
    expect(result.success).toBe(false);
  });
});

describe('unsubscribeMessageSchema', () => {
  it('accepts valid unsubscribe message', () => {
    const result = unsubscribeMessageSchema.safeParse({ type: 'unsubscribe', channel: 'feed' });
    expect(result.success).toBe(true);
  });

  it('rejects missing channel', () => {
    const result = unsubscribeMessageSchema.safeParse({ type: 'unsubscribe' });
    expect(result.success).toBe(false);
  });

  it('rejects wrong type', () => {
    const result = unsubscribeMessageSchema.safeParse({ type: 'subscribe', channel: 'feed' });
    expect(result.success).toBe(false);
  });

  it('rejects empty channel', () => {
    const result = unsubscribeMessageSchema.safeParse({ type: 'unsubscribe', channel: '' });
    expect(result.success).toBe(false);
  });
});

describe('presenceMessageSchema', () => {
  it('accepts valid presence message', () => {
    const result = presenceMessageSchema.safeParse({
      type: 'presence',
      channel: 'post:abc',
      status: 'viewing',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing channel', () => {
    const result = presenceMessageSchema.safeParse({ type: 'presence', status: 'viewing' });
    expect(result.success).toBe(false);
  });

  it('rejects missing status', () => {
    const result = presenceMessageSchema.safeParse({ type: 'presence', channel: 'post:abc' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = presenceMessageSchema.safeParse({
      type: 'presence',
      channel: 'post:abc',
      status: 'editing',
    });
    expect(result.success).toBe(false);
  });

  it('rejects wrong type', () => {
    const result = presenceMessageSchema.safeParse({
      type: 'auth',
      channel: 'post:abc',
      status: 'viewing',
    });
    expect(result.success).toBe(false);
  });
});

describe('clientMessageSchema (discriminated union)', () => {
  it('parses auth variant', () => {
    const result = clientMessageSchema.safeParse({ type: 'auth', token: 'jwt123' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('auth');
    }
  });

  it('parses subscribe variant', () => {
    const result = clientMessageSchema.safeParse({ type: 'subscribe', channel: 'feed' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('subscribe');
    }
  });

  it('parses unsubscribe variant', () => {
    const result = clientMessageSchema.safeParse({ type: 'unsubscribe', channel: 'feed' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('unsubscribe');
    }
  });

  it('parses presence variant', () => {
    const result = clientMessageSchema.safeParse({
      type: 'presence',
      channel: 'post:abc',
      status: 'viewing',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.type).toBe('presence');
    }
  });

  it('rejects unknown type', () => {
    const result = clientMessageSchema.safeParse({ type: 'unknown', data: 'foo' });
    expect(result.success).toBe(false);
  });

  it('rejects missing type field', () => {
    const result = clientMessageSchema.safeParse({ token: 'jwt' });
    expect(result.success).toBe(false);
  });

  it('narrows type correctly', () => {
    const msg: ClientMessage = { type: 'auth', token: 'jwt123' };
    if (msg.type === 'auth') {
      // TypeScript narrows to AuthMessage
      const _token: string = msg.token;
      expect(_token).toBe('jwt123');
    }
  });
});

// ── Server → Client schemas ─────────────────────────────────────────

describe('authOkMessageSchema', () => {
  it('accepts valid auth:ok', () => {
    const result = authOkMessageSchema.safeParse({ type: 'auth:ok' });
    expect(result.success).toBe(true);
  });

  it('rejects wrong type', () => {
    const result = authOkMessageSchema.safeParse({ type: 'auth:error' });
    expect(result.success).toBe(false);
  });
});

describe('authErrorMessageSchema', () => {
  it('accepts valid auth:error', () => {
    const result = authErrorMessageSchema.safeParse({ type: 'auth:error', reason: 'bad token' });
    expect(result.success).toBe(true);
  });

  it('rejects missing reason', () => {
    const result = authErrorMessageSchema.safeParse({ type: 'auth:error' });
    expect(result.success).toBe(false);
  });

  it('rejects empty reason', () => {
    const result = authErrorMessageSchema.safeParse({ type: 'auth:error', reason: '' });
    expect(result.success).toBe(false);
  });
});

describe('authExpiredMessageSchema', () => {
  it('accepts valid auth:expired', () => {
    const result = authExpiredMessageSchema.safeParse({ type: 'auth:expired' });
    expect(result.success).toBe(true);
  });

  it('rejects wrong type', () => {
    const result = authExpiredMessageSchema.safeParse({ type: 'auth:ok' });
    expect(result.success).toBe(false);
  });
});

describe('commentNewMessageSchema', () => {
  it('accepts valid comment:new', () => {
    const result = commentNewMessageSchema.safeParse({
      type: 'comment:new',
      channel: 'post:p1',
      data: validComment,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing channel', () => {
    const result = commentNewMessageSchema.safeParse({
      type: 'comment:new',
      data: validComment,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing data', () => {
    const result = commentNewMessageSchema.safeParse({
      type: 'comment:new',
      channel: 'post:p1',
    });
    expect(result.success).toBe(false);
  });
});

describe('commentUpdatedMessageSchema', () => {
  it('accepts valid comment:updated', () => {
    const result = commentUpdatedMessageSchema.safeParse({
      type: 'comment:updated',
      channel: 'post:p1',
      data: validComment,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing data', () => {
    const result = commentUpdatedMessageSchema.safeParse({
      type: 'comment:updated',
      channel: 'post:p1',
    });
    expect(result.success).toBe(false);
  });
});

describe('commentDeletedMessageSchema', () => {
  it('accepts valid comment:deleted', () => {
    const result = commentDeletedMessageSchema.safeParse({
      type: 'comment:deleted',
      channel: 'post:p1',
      data: { id: 'c1' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing id in data', () => {
    const result = commentDeletedMessageSchema.safeParse({
      type: 'comment:deleted',
      channel: 'post:p1',
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty id', () => {
    const result = commentDeletedMessageSchema.safeParse({
      type: 'comment:deleted',
      channel: 'post:p1',
      data: { id: '' },
    });
    expect(result.success).toBe(false);
  });
});

describe('voteUpdatedMessageSchema', () => {
  it('accepts valid vote:updated', () => {
    const result = voteUpdatedMessageSchema.safeParse({
      type: 'vote:updated',
      channel: 'post:p1',
      data: { voteCount: 42 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing voteCount', () => {
    const result = voteUpdatedMessageSchema.safeParse({
      type: 'vote:updated',
      channel: 'post:p1',
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer voteCount', () => {
    const result = voteUpdatedMessageSchema.safeParse({
      type: 'vote:updated',
      channel: 'post:p1',
      data: { voteCount: 1.5 },
    });
    expect(result.success).toBe(false);
  });
});

describe('revisionNewMessageSchema', () => {
  it('accepts valid revision:new', () => {
    const result = revisionNewMessageSchema.safeParse({
      type: 'revision:new',
      channel: 'post:p1',
      data: validPostRevision,
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing data', () => {
    const result = revisionNewMessageSchema.safeParse({
      type: 'revision:new',
      channel: 'post:p1',
    });
    expect(result.success).toBe(false);
  });
});

describe('presenceUpdateMessageSchema', () => {
  it('accepts valid presence:update', () => {
    const result = presenceUpdateMessageSchema.safeParse({
      type: 'presence:update',
      channel: 'post:p1',
      data: { users: [validUser] },
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty users array', () => {
    const result = presenceUpdateMessageSchema.safeParse({
      type: 'presence:update',
      channel: 'post:p1',
      data: { users: [] },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing users', () => {
    const result = presenceUpdateMessageSchema.safeParse({
      type: 'presence:update',
      channel: 'post:p1',
      data: {},
    });
    expect(result.success).toBe(false);
  });
});

describe('postNewMessageSchema', () => {
  it('accepts valid post:new', () => {
    const result = postNewMessageSchema.safeParse({
      type: 'post:new',
      channel: 'feed',
      data: validPostWithAuthor,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-feed channel', () => {
    const result = postNewMessageSchema.safeParse({
      type: 'post:new',
      channel: 'post:p1',
      data: validPostWithAuthor,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing data', () => {
    const result = postNewMessageSchema.safeParse({
      type: 'post:new',
      channel: 'feed',
    });
    expect(result.success).toBe(false);
  });
});

describe('postUpdatedMessageSchema', () => {
  it('accepts valid post:updated', () => {
    const result = postUpdatedMessageSchema.safeParse({
      type: 'post:updated',
      channel: 'feed',
      data: validPostWithAuthor,
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-feed channel', () => {
    const result = postUpdatedMessageSchema.safeParse({
      type: 'post:updated',
      channel: 'post:p1',
      data: validPostWithAuthor,
    });
    expect(result.success).toBe(false);
  });
});

describe('serverMessageSchema (discriminated union)', () => {
  it('parses auth:ok variant', () => {
    const result = serverMessageSchema.safeParse({ type: 'auth:ok' });
    expect(result.success).toBe(true);
  });

  it('parses auth:error variant', () => {
    const result = serverMessageSchema.safeParse({ type: 'auth:error', reason: 'invalid' });
    expect(result.success).toBe(true);
  });

  it('parses auth:expired variant', () => {
    const result = serverMessageSchema.safeParse({ type: 'auth:expired' });
    expect(result.success).toBe(true);
  });

  it('parses comment:new variant', () => {
    const result = serverMessageSchema.safeParse({
      type: 'comment:new',
      channel: 'post:p1',
      data: validComment,
    });
    expect(result.success).toBe(true);
  });

  it('parses comment:updated variant', () => {
    const result = serverMessageSchema.safeParse({
      type: 'comment:updated',
      channel: 'post:p1',
      data: validComment,
    });
    expect(result.success).toBe(true);
  });

  it('parses comment:deleted variant', () => {
    const result = serverMessageSchema.safeParse({
      type: 'comment:deleted',
      channel: 'post:p1',
      data: { id: 'c1' },
    });
    expect(result.success).toBe(true);
  });

  it('parses vote:updated variant', () => {
    const result = serverMessageSchema.safeParse({
      type: 'vote:updated',
      channel: 'post:p1',
      data: { voteCount: 5 },
    });
    expect(result.success).toBe(true);
  });

  it('parses revision:new variant', () => {
    const result = serverMessageSchema.safeParse({
      type: 'revision:new',
      channel: 'post:p1',
      data: validPostRevision,
    });
    expect(result.success).toBe(true);
  });

  it('parses presence:update variant', () => {
    const result = serverMessageSchema.safeParse({
      type: 'presence:update',
      channel: 'post:p1',
      data: { users: [validUser] },
    });
    expect(result.success).toBe(true);
  });

  it('parses post:new variant', () => {
    const result = serverMessageSchema.safeParse({
      type: 'post:new',
      channel: 'feed',
      data: validPostWithAuthor,
    });
    expect(result.success).toBe(true);
  });

  it('parses post:updated variant', () => {
    const result = serverMessageSchema.safeParse({
      type: 'post:updated',
      channel: 'feed',
      data: validPostWithAuthor,
    });
    expect(result.success).toBe(true);
  });

  it('rejects unknown type', () => {
    const result = serverMessageSchema.safeParse({ type: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects missing type field', () => {
    const result = serverMessageSchema.safeParse({ channel: 'post:p1' });
    expect(result.success).toBe(false);
  });

  it('narrows ServerMessage type correctly', () => {
    const msg: ServerMessage = { type: 'auth:error', reason: 'expired' };
    if (msg.type === 'auth:error') {
      const _reason: string = msg.reason;
      expect(_reason).toBe('expired');
    }
  });
});

// ── Type-level compile checks ────────────────────────────────────────

describe('type narrowing compile checks', () => {
  it('ClientMessage narrows all variants', () => {
    const messages: ClientMessage[] = [
      { type: 'auth', token: 'jwt' },
      { type: 'subscribe', channel: 'feed' },
      { type: 'unsubscribe', channel: 'feed' },
      { type: 'presence', channel: 'post:p1', status: 'viewing' },
    ];
    expect(messages).toHaveLength(4);

    for (const msg of messages) {
      switch (msg.type) {
        case 'auth': {
          const _t: AuthMessage = msg;
          expect(_t.token).toBeDefined();
          break;
        }
        case 'subscribe': {
          const _s: SubscribeMessage = msg;
          expect(_s.channel).toBeDefined();
          break;
        }
        case 'unsubscribe': {
          const _u: UnsubscribeMessage = msg;
          expect(_u.channel).toBeDefined();
          break;
        }
        case 'presence': {
          const _p: PresenceMessage = msg;
          expect(_p.status).toBe('viewing');
          break;
        }
      }
    }
  });

  it('ServerMessage narrows all variants', () => {
    const messages: ServerMessage[] = [
      { type: 'auth:ok' },
      { type: 'auth:error', reason: 'bad' },
      { type: 'auth:expired' },
      { type: 'comment:new', channel: 'post:p1', data: validComment as never },
      { type: 'comment:updated', channel: 'post:p1', data: validComment as never },
      { type: 'comment:deleted', channel: 'post:p1', data: { id: 'c1' } },
      { type: 'vote:updated', channel: 'post:p1', data: { voteCount: 1 } },
      { type: 'revision:new', channel: 'post:p1', data: validPostRevision as never },
      { type: 'presence:update', channel: 'post:p1', data: { users: [] } },
      { type: 'post:new', channel: 'feed', data: validPostWithAuthor as never },
      { type: 'post:updated', channel: 'feed', data: validPostWithAuthor as never },
    ];
    expect(messages).toHaveLength(11);

    for (const msg of messages) {
      switch (msg.type) {
        case 'auth:ok': {
          const _m: AuthOkMessage = msg;
          expect(_m.type).toBe('auth:ok');
          break;
        }
        case 'auth:error': {
          const _m: AuthErrorMessage = msg;
          expect(_m.reason).toBeDefined();
          break;
        }
        case 'auth:expired': {
          const _m: AuthExpiredMessage = msg;
          expect(_m.type).toBe('auth:expired');
          break;
        }
        case 'comment:new': {
          const _m: CommentNewMessage = msg;
          expect(_m.data).toBeDefined();
          break;
        }
        case 'comment:updated': {
          const _m: CommentUpdatedMessage = msg;
          expect(_m.data).toBeDefined();
          break;
        }
        case 'comment:deleted': {
          const _m: CommentDeletedMessage = msg;
          expect(_m.data.id).toBeDefined();
          break;
        }
        case 'vote:updated': {
          const _m: VoteUpdatedMessage = msg;
          expect(_m.data.voteCount).toBeDefined();
          break;
        }
        case 'revision:new': {
          const _m: RevisionNewMessage = msg;
          expect(_m.data).toBeDefined();
          break;
        }
        case 'presence:update': {
          const _m: PresenceUpdateMessage = msg;
          expect(_m.data.users).toBeDefined();
          break;
        }
        case 'post:new': {
          const _m: PostNewMessage = msg;
          expect(_m.channel).toBe('feed');
          break;
        }
        case 'post:updated': {
          const _m: PostUpdatedMessage = msg;
          expect(_m.channel).toBe('feed');
          break;
        }
      }
    }
  });
});

// ── Re-export verification ───────────────────────────────────────────

describe('index re-exports', () => {
  it('re-exports schemas from index', async () => {
    const indexModule = await import('../../types/index.js');
    expect(indexModule.clientMessageSchema).toBeDefined();
    expect(indexModule.serverMessageSchema).toBeDefined();
    expect(indexModule.authMessageSchema).toBeDefined();
    expect(indexModule.subscribeMessageSchema).toBeDefined();
    expect(indexModule.unsubscribeMessageSchema).toBeDefined();
    expect(indexModule.presenceMessageSchema).toBeDefined();
    expect(indexModule.authOkMessageSchema).toBeDefined();
    expect(indexModule.authErrorMessageSchema).toBeDefined();
    expect(indexModule.authExpiredMessageSchema).toBeDefined();
    expect(indexModule.commentNewMessageSchema).toBeDefined();
    expect(indexModule.commentUpdatedMessageSchema).toBeDefined();
    expect(indexModule.commentDeletedMessageSchema).toBeDefined();
    expect(indexModule.voteUpdatedMessageSchema).toBeDefined();
    expect(indexModule.revisionNewMessageSchema).toBeDefined();
    expect(indexModule.presenceUpdateMessageSchema).toBeDefined();
    expect(indexModule.postNewMessageSchema).toBeDefined();
    expect(indexModule.postUpdatedMessageSchema).toBeDefined();
  });
});
