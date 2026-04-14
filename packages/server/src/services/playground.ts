import {
  findPromptVariablesByPostId,
  upsertPromptVariable,
  deleteStalePromptVariables,
} from '../db/queries/prompt-variables.js';
import { findRevisionsByPostId } from '../db/queries/revisions.js';
import { findPostById } from '../db/queries/posts.js';
import { extractVariables, assemblePrompt } from '@forge/shared';
import type { PromptVariableRow } from '../db/queries/types.js';

export async function getVariablesForPost(postId: string): Promise<PromptVariableRow[]> {
  return findPromptVariablesByPostId(postId);
}

export async function syncVariablesFromContent(
  postId: string,
  content: string,
): Promise<PromptVariableRow[]> {
  const names = extractVariables(content);
  for (const [i, name] of names.entries()) {
    await upsertPromptVariable({
      postId,
      name,
      sortOrder: i,
    });
  }
  await deleteStalePromptVariables(postId, names);
  return findPromptVariablesByPostId(postId);
}

export async function assemblePromptForPost(
  postId: string,
  variables: Record<string, string>,
): Promise<string> {
  const post = await findPostById(postId);
  if (!post) {
    throw new Error('Post not found');
  }
  const revisions = await findRevisionsByPostId(postId);
  const latest = revisions[0];
  if (!latest) {
    throw new Error('Post has no content');
  }
  return assemblePrompt(latest.content, variables);
}
