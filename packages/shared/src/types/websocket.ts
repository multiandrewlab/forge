import { z } from 'zod';

// ── Shared payload schemas ───────────────────────────────────────────
// Runtime zod schemas for data payloads referenced by server messages.
// These mirror the corresponding TypeScript interfaces in sibling modules.

const commentAuthorSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  avatarUrl: z.string().nullable(),
});

const commentSchema = z.object({
  id: z.string().min(1),
  postId: z.string().min(1),
  author: commentAuthorSchema.nullable(),
  parentId: z.string().nullable(),
  lineNumber: z.number().int().nullable(),
  revisionId: z.string().nullable(),
  revisionNumber: z.number().int().nullable(),
  body: z.string().min(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const postRevisionSchema = z.object({
  id: z.string().min(1),
  postId: z.string().min(1),
  content: z.string(),
  message: z.string().nullable(),
  revisionNumber: z.number().int(),
  createdAt: z.union([z.string(), z.date()]),
});

const userSchema = z.object({
  id: z.string().min(1),
  email: z.string(),
  displayName: z.string().min(1),
  avatarUrl: z.string().nullable(),
  authProvider: z.string(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
});

const linkPreviewSchema = z.object({
  title: z.string(),
  description: z.string(),
  image: z.string().nullable(),
  readingTime: z.number().nullable(),
});

const postAuthorSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  avatarUrl: z.string().nullable(),
});

const postWithAuthorSchema = z.object({
  id: z.string().min(1),
  authorId: z.string().min(1),
  title: z.string(),
  contentType: z.string(),
  language: z.string().nullable(),
  visibility: z.string(),
  isDraft: z.boolean(),
  forkedFromId: z.string().nullable(),
  linkUrl: z.string().nullable(),
  linkPreview: linkPreviewSchema.nullable(),
  voteCount: z.number().int(),
  viewCount: z.number().int(),
  deletedAt: z.union([z.string(), z.date()]).nullable(),
  createdAt: z.union([z.string(), z.date()]),
  updatedAt: z.union([z.string(), z.date()]),
  author: postAuthorSchema,
  tags: z.array(z.string()),
});

// ── Client → Server message schemas ─────────────────────────────────

export const authMessageSchema = z.object({
  type: z.literal('auth'),
  token: z.string().min(1),
});

export const subscribeMessageSchema = z.object({
  type: z.literal('subscribe'),
  channel: z.string().min(1),
});

export const unsubscribeMessageSchema = z.object({
  type: z.literal('unsubscribe'),
  channel: z.string().min(1),
});

export const presenceMessageSchema = z.object({
  type: z.literal('presence'),
  channel: z.string().min(1),
  status: z.literal('viewing'),
});

export const clientMessageSchema = z.discriminatedUnion('type', [
  authMessageSchema,
  subscribeMessageSchema,
  unsubscribeMessageSchema,
  presenceMessageSchema,
]);

// ── Client → Server types ────────────────────────────────────────────

export type AuthMessage = z.infer<typeof authMessageSchema>;
export type SubscribeMessage = z.infer<typeof subscribeMessageSchema>;
export type UnsubscribeMessage = z.infer<typeof unsubscribeMessageSchema>;
export type PresenceMessage = z.infer<typeof presenceMessageSchema>;
export type ClientMessage = z.infer<typeof clientMessageSchema>;

// ── Server → Client message schemas ─────────────────────────────────

export const authOkMessageSchema = z.object({
  type: z.literal('auth:ok'),
});

export const authErrorMessageSchema = z.object({
  type: z.literal('auth:error'),
  reason: z.string().min(1),
});

export const authExpiredMessageSchema = z.object({
  type: z.literal('auth:expired'),
});

export const commentNewMessageSchema = z.object({
  type: z.literal('comment:new'),
  channel: z.string().min(1),
  data: commentSchema,
});

export const commentUpdatedMessageSchema = z.object({
  type: z.literal('comment:updated'),
  channel: z.string().min(1),
  data: commentSchema,
});

export const commentDeletedMessageSchema = z.object({
  type: z.literal('comment:deleted'),
  channel: z.string().min(1),
  data: z.object({ id: z.string().min(1) }),
});

export const voteUpdatedMessageSchema = z.object({
  type: z.literal('vote:updated'),
  channel: z.string().min(1),
  data: z.object({ voteCount: z.number().int() }),
});

export const revisionNewMessageSchema = z.object({
  type: z.literal('revision:new'),
  channel: z.string().min(1),
  data: postRevisionSchema,
});

export const presenceUpdateMessageSchema = z.object({
  type: z.literal('presence:update'),
  channel: z.string().min(1),
  data: z.object({ users: z.array(userSchema) }),
});

export const postNewMessageSchema = z.object({
  type: z.literal('post:new'),
  channel: z.literal('feed'),
  data: postWithAuthorSchema,
});

export const postUpdatedMessageSchema = z.object({
  type: z.literal('post:updated'),
  channel: z.literal('feed'),
  data: postWithAuthorSchema,
});

export const serverMessageSchema = z.discriminatedUnion('type', [
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
]);

// ── Server → Client types ────────────────────────────────────────────

export type AuthOkMessage = z.infer<typeof authOkMessageSchema>;
export type AuthErrorMessage = z.infer<typeof authErrorMessageSchema>;
export type AuthExpiredMessage = z.infer<typeof authExpiredMessageSchema>;
export type CommentNewMessage = z.infer<typeof commentNewMessageSchema>;
export type CommentUpdatedMessage = z.infer<typeof commentUpdatedMessageSchema>;
export type CommentDeletedMessage = z.infer<typeof commentDeletedMessageSchema>;
export type VoteUpdatedMessage = z.infer<typeof voteUpdatedMessageSchema>;
export type RevisionNewMessage = z.infer<typeof revisionNewMessageSchema>;
export type PresenceUpdateMessage = z.infer<typeof presenceUpdateMessageSchema>;
export type PostNewMessage = z.infer<typeof postNewMessageSchema>;
export type PostUpdatedMessage = z.infer<typeof postUpdatedMessageSchema>;
export type ServerMessage = z.infer<typeof serverMessageSchema>;
