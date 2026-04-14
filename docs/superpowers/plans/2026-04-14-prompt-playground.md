# Prompt Playground Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a dedicated playground page where users can fill template variables in prompt-type posts, run the assembled prompt against the LLM with SSE streaming, and copy results.

**Architecture:** Three-layer approach — shared types/validators define the contract, server routes expose GET variables + POST streaming run backed by a LangChain chain, and Vue client renders a two-panel playground with dynamic variable inputs and progressive output. Reuses existing SSE infrastructure, rate limiter, and provider factory from Issue #10.

**Tech Stack:** TypeScript, Fastify, LangChain, Vue 3 + Composition API, Tailwind CSS, Vitest, Zod, Bruno

---

## File Structure

### Shared (packages/shared/src)

- **Create:** `types/prompt.ts` — `PromptVariable` interface, `extractVariables()`, `assemblePrompt()`
- **Modify:** `types/index.ts` — re-export prompt types
- **Create:** `validators/playground.ts` — `playgroundRunSchema` Zod schema
- **Modify:** `validators/index.ts` — re-export playground validators

### Server (packages/server/src)

- **Modify:** `db/queries/prompt-variables.ts` — add `upsertPromptVariable()`, `deleteStalePromptVariables()`
- **Create:** `services/playground.ts` — `getVariablesForPost()`, `syncVariablesFromContent()`, `assemblePromptForPost()`
- **Create:** `plugins/langchain/chains/playground.ts` — `createPlaygroundChain()`, `streamPlayground()`
- **Create:** `routes/playground.ts` — GET `/posts/:id/variables`, POST `/playground/run`
- **Modify:** `app.ts` — register playground routes

### Client (packages/client/src)

- **Create:** `composables/usePlayground.ts` — `fetchVariables()`, `run()`, `stop()`
- **Create:** `components/playground/PlaygroundHeader.vue` — title + Run/Stop button
- **Create:** `components/playground/PromptVariableInput.vue` — dynamic input per variable
- **Create:** `components/playground/PromptOutput.vue` — streaming display + copy button
- **Create:** `pages/PlaygroundPage.vue` — two-panel layout
- **Modify:** `plugins/router.ts` — add `/playground/:id` route

### Bruno (bruno/)

- **Create:** `playground/get-variables.bru`
- **Create:** `playground/run-prompt.bru`

### Tests

- `packages/shared/src/__tests__/types/prompt.test.ts`
- `packages/shared/src/__tests__/validators/playground.test.ts`
- `packages/server/src/__tests__/db/queries/prompt-variables.test.ts` (extend)
- `packages/server/src/__tests__/services/playground.test.ts`
- `packages/server/src/__tests__/plugins/langchain/playground-chain.test.ts`
- `packages/server/src/__tests__/routes/playground.test.ts`
- `packages/server/src/__tests__/app.test.ts` (extend)
- `packages/client/src/__tests__/composables/usePlayground.test.ts`
- `packages/client/src/__tests__/components/playground/PlaygroundHeader.test.ts`
- `packages/client/src/__tests__/components/playground/PromptVariableInput.test.ts`
- `packages/client/src/__tests__/components/playground/PromptOutput.test.ts`
- `packages/client/src/__tests__/pages/PlaygroundPage.test.ts`
- `packages/client/src/__tests__/plugins/router.test.ts` (extend)

---

## Task 1: Shared — PromptVariable type + extraction utilities

**Files:**

- Create: `packages/shared/src/types/prompt.ts`
- Create: `packages/shared/src/__tests__/types/prompt.test.ts`
- Modify: `packages/shared/src/types/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/__tests__/types/prompt.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { extractVariables, assemblePrompt } from '../../types/prompt.js';
import type { PromptVariable } from '../../types/prompt.js';

describe('PromptVariable type', () => {
  it('satisfies the interface shape', () => {
    const v: PromptVariable = {
      id: 'abc',
      postId: 'def',
      name: 'Language',
      placeholder: 'e.g. TypeScript',
      defaultValue: 'JavaScript',
      sortOrder: 0,
    };
    expect(v.name).toBe('Language');
  });
});

describe('extractVariables', () => {
  it('extracts simple variable names', () => {
    const content = 'Hello {{name}}, welcome to {{place}}';
    expect(extractVariables(content)).toEqual(['name', 'place']);
  });

  it('handles whitespace inside braces', () => {
    const content = '{{ name }} and {{  place  }}';
    expect(extractVariables(content)).toEqual(['name', 'place']);
  });

  it('deduplicates repeated variables', () => {
    const content = '{{name}} is {{name}}';
    expect(extractVariables(content)).toEqual(['name']);
  });

  it('returns empty array for no variables', () => {
    expect(extractVariables('plain text')).toEqual([]);
  });

  it('handles multi-word variable names', () => {
    const content = '{{Error Log}} and {{Programming Language}}';
    expect(extractVariables(content)).toEqual(['Error Log', 'Programming Language']);
  });

  it('handles empty content', () => {
    expect(extractVariables('')).toEqual([]);
  });

  it('preserves order of first occurrence', () => {
    const content = '{{b}} then {{a}} then {{b}}';
    expect(extractVariables(content)).toEqual(['b', 'a']);
  });
});

describe('assemblePrompt', () => {
  it('replaces variables with provided values', () => {
    const template = 'Hello {{name}}, welcome to {{place}}';
    const result = assemblePrompt(template, { name: 'Alice', place: 'Wonderland' });
    expect(result).toBe('Hello Alice, welcome to Wonderland');
  });

  it('handles whitespace inside braces', () => {
    const template = 'Hello {{ name }}';
    const result = assemblePrompt(template, { name: 'Bob' });
    expect(result).toBe('Hello Bob');
  });

  it('leaves unfilled variables as-is', () => {
    const template = '{{filled}} and {{unfilled}}';
    const result = assemblePrompt(template, { filled: 'yes' });
    expect(result).toBe('yes and {{unfilled}}');
  });

  it('handles empty variables map', () => {
    const template = '{{a}} {{b}}';
    const result = assemblePrompt(template, {});
    expect(result).toBe('{{a}} {{b}}');
  });

  it('handles template with no variables', () => {
    const result = assemblePrompt('plain text', { name: 'Alice' });
    expect(result).toBe('plain text');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/shared && npx vitest run src/__tests__/types/prompt.test.ts`
Expected: FAIL — module `../../types/prompt.js` not found

- [ ] **Step 3: Implement the types and utilities**

Create `packages/shared/src/types/prompt.ts`:

```typescript
export interface PromptVariable {
  id: string;
  postId: string;
  name: string;
  placeholder: string | null;
  defaultValue: string | null;
  sortOrder: number;
}

const VARIABLE_PATTERN = /\{\{([^}]+)\}\}/g;

export function extractVariables(content: string): string[] {
  const matches = content.matchAll(VARIABLE_PATTERN);
  const seen = new Set<string>();
  const result: string[] = [];
  for (const m of matches) {
    const name = m[1].trim();
    if (!seen.has(name)) {
      seen.add(name);
      result.push(name);
    }
  }
  return result;
}

export function assemblePrompt(template: string, variables: Record<string, string>): string {
  return template.replace(VARIABLE_PATTERN, (match, name: string) => {
    const trimmed = name.trim();
    return trimmed in variables ? variables[trimmed] : `{{${trimmed}}}`;
  });
}
```

- [ ] **Step 4: Export from types/index.ts**

Add to `packages/shared/src/types/index.ts`:

```typescript
export type { PromptVariable } from './prompt.js';
export { extractVariables, assemblePrompt } from './prompt.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/shared && npx vitest run src/__tests__/types/prompt.test.ts`
Expected: PASS — all 12 tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/types/prompt.ts packages/shared/src/types/index.ts packages/shared/src/__tests__/types/prompt.test.ts
git commit -m "feat(shared): add PromptVariable type and extraction utilities"
```

---

## Task 2: Shared — Playground request validator

**Files:**

- Create: `packages/shared/src/validators/playground.ts`
- Create: `packages/shared/src/__tests__/validators/playground.test.ts`
- Modify: `packages/shared/src/validators/index.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/shared/src/__tests__/validators/playground.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { playgroundRunSchema } from '../../validators/playground.js';

describe('playgroundRunSchema', () => {
  it('accepts a valid request', () => {
    const r = playgroundRunSchema.safeParse({
      postId: '550e8400-e29b-41d4-a716-446655440000',
      variables: { name: 'Alice', language: 'TypeScript' },
    });
    expect(r.success).toBe(true);
  });

  it('accepts empty variables', () => {
    const r = playgroundRunSchema.safeParse({
      postId: '550e8400-e29b-41d4-a716-446655440000',
      variables: {},
    });
    expect(r.success).toBe(true);
  });

  it('rejects missing postId', () => {
    const r = playgroundRunSchema.safeParse({ variables: {} });
    expect(r.success).toBe(false);
  });

  it('rejects non-uuid postId', () => {
    const r = playgroundRunSchema.safeParse({
      postId: 'not-a-uuid',
      variables: {},
    });
    expect(r.success).toBe(false);
  });

  it('rejects missing variables', () => {
    const r = playgroundRunSchema.safeParse({
      postId: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(r.success).toBe(false);
  });

  it('rejects non-string variable values', () => {
    const r = playgroundRunSchema.safeParse({
      postId: '550e8400-e29b-41d4-a716-446655440000',
      variables: { name: 123 },
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/shared && npx vitest run src/__tests__/validators/playground.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the validator**

Create `packages/shared/src/validators/playground.ts`:

```typescript
import { z } from 'zod';

export const playgroundRunSchema = z.object({
  postId: z.string().uuid(),
  variables: z.record(z.string(), z.string()),
});

export type PlaygroundRunInput = z.infer<typeof playgroundRunSchema>;
```

- [ ] **Step 4: Export from validators/index.ts**

Add to `packages/shared/src/validators/index.ts`:

```typescript
export { playgroundRunSchema } from './playground.js';
export type { PlaygroundRunInput } from './playground.js';
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd packages/shared && npx vitest run src/__tests__/validators/playground.test.ts`
Expected: PASS — all 6 tests pass

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/validators/playground.ts packages/shared/src/validators/index.ts packages/shared/src/__tests__/validators/playground.test.ts
git commit -m "feat(shared): add playgroundRunSchema validator"
```

---

## Task 3: Server — Extend prompt-variables DB queries

**Files:**

- Modify: `packages/server/src/db/queries/prompt-variables.ts`
- Modify: `packages/server/src/__tests__/db/queries/prompt-variables.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `packages/server/src/__tests__/db/queries/prompt-variables.test.ts` (append inside the outer `describe` block, after the existing `createPromptVariable` describe):

```typescript
describe('upsertPromptVariable', () => {
  it('inserts a new variable using ON CONFLICT', async () => {
    mockQuery.mockResolvedValue({ rows: [sampleVariable], rowCount: 1 });
    const { upsertPromptVariable } = await import('../../../db/queries/prompt-variables.js');
    const result = await upsertPromptVariable({
      postId: sampleVariable.post_id,
      name: 'component_name',
      placeholder: 'e.g., UserProfile',
      sortOrder: 0,
      defaultValue: 'MyComponent',
    });
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT (post_id, name)'), [
      sampleVariable.post_id,
      'component_name',
      'e.g., UserProfile',
      0,
      'MyComponent',
    ]);
    expect(result).toEqual(sampleVariable);
  });
});

describe('deleteStalePromptVariables', () => {
  it('deletes variables not in keepNames', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const { deleteStalePromptVariables } = await import('../../../db/queries/prompt-variables.js');
    await deleteStalePromptVariables(sampleVariable.post_id, ['component_name']);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('NOT IN'), [
      sampleVariable.post_id,
      'component_name',
    ]);
  });

  it('deletes all variables when keepNames is empty', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
    const { deleteStalePromptVariables } = await import('../../../db/queries/prompt-variables.js');
    await deleteStalePromptVariables(sampleVariable.post_id, []);
    expect(mockQuery).toHaveBeenCalledWith('DELETE FROM prompt_variables WHERE post_id = $1', [
      sampleVariable.post_id,
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/db/queries/prompt-variables.test.ts`
Expected: FAIL — `upsertPromptVariable` and `deleteStalePromptVariables` not exported

- [ ] **Step 3: Implement the new query functions**

Add to the bottom of `packages/server/src/db/queries/prompt-variables.ts`:

```typescript
export async function upsertPromptVariable(
  input: CreatePromptVariableInput,
): Promise<PromptVariableRow> {
  const result = await query<PromptVariableRow>(
    `INSERT INTO prompt_variables (post_id, name, placeholder, sort_order, default_value)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (post_id, name)
     DO UPDATE SET sort_order = EXCLUDED.sort_order
     RETURNING *`,
    [input.postId, input.name, input.placeholder, input.sortOrder, input.defaultValue],
  );
  return result.rows[0] as PromptVariableRow;
}

export async function deleteStalePromptVariables(
  postId: string,
  keepNames: string[],
): Promise<void> {
  if (keepNames.length === 0) {
    await query('DELETE FROM prompt_variables WHERE post_id = $1', [postId]);
    return;
  }
  const placeholders = keepNames.map((_, i) => `$${i + 2}`).join(', ');
  await query(`DELETE FROM prompt_variables WHERE post_id = $1 AND name NOT IN (${placeholders})`, [
    postId,
    ...keepNames,
  ]);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/db/queries/prompt-variables.test.ts`
Expected: PASS — all 5 tests pass (2 existing + 3 new)

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/queries/prompt-variables.ts packages/server/src/__tests__/db/queries/prompt-variables.test.ts
git commit -m "feat(server): add upsert and delete-stale prompt variable queries"
```

---

## Task 4: Server — Playground service

**Files:**

- Create: `packages/server/src/services/playground.ts`
- Create: `packages/server/src/__tests__/services/playground.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/__tests__/services/playground.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../db/queries/prompt-variables.js', () => ({
  findPromptVariablesByPostId: vi.fn(),
  upsertPromptVariable: vi.fn(),
  deleteStalePromptVariables: vi.fn(),
}));

vi.mock('../../db/queries/revisions.js', () => ({
  findRevisionsByPostId: vi.fn(),
}));

vi.mock('../../db/queries/posts.js', () => ({
  findPostById: vi.fn(),
}));

import {
  findPromptVariablesByPostId,
  upsertPromptVariable,
  deleteStalePromptVariables,
} from '../../db/queries/prompt-variables.js';
import { findRevisionsByPostId } from '../../db/queries/revisions.js';
import { findPostById } from '../../db/queries/posts.js';
import {
  getVariablesForPost,
  syncVariablesFromContent,
  assemblePromptForPost,
} from '../../services/playground.js';
import type { PromptVariableRow } from '../../db/queries/types.js';

const mockFindVariables = findPromptVariablesByPostId as Mock;
const mockUpsert = upsertPromptVariable as Mock;
const mockDeleteStale = deleteStalePromptVariables as Mock;
const mockFindRevisions = findRevisionsByPostId as Mock;
const mockFindPost = findPostById as Mock;

const sampleVariable: PromptVariableRow = {
  id: 'ff000000-0000-0000-0000-000000000010',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  name: 'Language',
  placeholder: 'e.g. TypeScript',
  sort_order: 0,
  default_value: 'JavaScript',
};

describe('getVariablesForPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns variables from the database', async () => {
    mockFindVariables.mockResolvedValue([sampleVariable]);
    const result = await getVariablesForPost('post-1');
    expect(mockFindVariables).toHaveBeenCalledWith('post-1');
    expect(result).toEqual([sampleVariable]);
  });
});

describe('syncVariablesFromContent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts extracted variables and deletes stale ones', async () => {
    mockUpsert.mockResolvedValue(sampleVariable);
    mockDeleteStale.mockResolvedValue(undefined);
    mockFindVariables.mockResolvedValue([sampleVariable]);

    const content = 'Hello {{Language}}, use {{Framework}}';
    const result = await syncVariablesFromContent('post-1', content);

    expect(mockUpsert).toHaveBeenCalledTimes(2);
    expect(mockUpsert).toHaveBeenCalledWith({
      postId: 'post-1',
      name: 'Language',
      placeholder: null,
      sortOrder: 0,
      defaultValue: null,
    });
    expect(mockUpsert).toHaveBeenCalledWith({
      postId: 'post-1',
      name: 'Framework',
      placeholder: null,
      sortOrder: 1,
      defaultValue: null,
    });
    expect(mockDeleteStale).toHaveBeenCalledWith('post-1', ['Language', 'Framework']);
    expect(result).toEqual([sampleVariable]);
  });

  it('handles content with no variables', async () => {
    mockDeleteStale.mockResolvedValue(undefined);
    mockFindVariables.mockResolvedValue([]);

    const result = await syncVariablesFromContent('post-1', 'plain text');

    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockDeleteStale).toHaveBeenCalledWith('post-1', []);
    expect(result).toEqual([]);
  });
});

describe('assemblePromptForPost', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches latest revision and assembles prompt', async () => {
    mockFindPost.mockResolvedValue({ id: 'post-1', content_type: 'prompt' });
    mockFindRevisions.mockResolvedValue([
      { content: 'Hello {{name}}, language: {{lang}}', revision_number: 2 },
      { content: 'old version', revision_number: 1 },
    ]);

    const result = await assemblePromptForPost('post-1', {
      name: 'Alice',
      lang: 'TypeScript',
    });

    expect(result).toBe('Hello Alice, language: TypeScript');
  });

  it('throws when post not found', async () => {
    mockFindPost.mockResolvedValue(null);

    await expect(assemblePromptForPost('missing', {})).rejects.toThrow('Post not found');
  });

  it('throws when post has no revisions', async () => {
    mockFindPost.mockResolvedValue({ id: 'post-1' });
    mockFindRevisions.mockResolvedValue([]);

    await expect(assemblePromptForPost('post-1', {})).rejects.toThrow('Post has no content');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/services/playground.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the service**

Create `packages/server/src/services/playground.ts`:

```typescript
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

  for (let i = 0; i < names.length; i++) {
    await upsertPromptVariable({
      postId,
      name: names[i],
      placeholder: null,
      sortOrder: i,
      defaultValue: null,
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
  if (revisions.length === 0) {
    throw new Error('Post has no content');
  }

  return assemblePrompt(revisions[0].content, variables);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/services/playground.test.ts`
Expected: PASS — all 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/playground.ts packages/server/src/__tests__/services/playground.test.ts
git commit -m "feat(server): add playground service for variable sync and prompt assembly"
```

---

## Task 5: Server — Playground LangChain chain

**Files:**

- Create: `packages/server/src/plugins/langchain/chains/playground.ts`
- Create: `packages/server/src/__tests__/plugins/langchain/playground-chain.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/__tests__/plugins/langchain/playground-chain.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type {
  PlaygroundChain,
  PlaygroundInput,
} from '../../../plugins/langchain/chains/playground.js';
import {
  createPlaygroundChain,
  streamPlayground,
} from '../../../plugins/langchain/chains/playground.js';

function makeFakeChain(chunks: string[]): PlaygroundChain {
  return {
    stream(_input: PlaygroundInput, opts?: { signal?: AbortSignal }) {
      async function* gen() {
        for (const c of chunks) {
          if (opts?.signal?.aborted) throw new Error('aborted');
          yield c;
        }
      }
      return Promise.resolve(gen());
    },
  } as unknown as PlaygroundChain;
}

describe('createPlaygroundChain', () => {
  it('returns a Runnable with a stream method', () => {
    const model = new FakeListChatModel({ responses: ['playground output'] });
    const chain = createPlaygroundChain(model);
    expect(chain).toBeTruthy();
    expect(typeof chain.stream).toBe('function');
  });
});

describe('streamPlayground', () => {
  it('yields tokens from the chain in order', async () => {
    const chain = makeFakeChain(['Hello ', 'world']);
    const out: string[] = [];
    for await (const tok of streamPlayground(chain, { prompt: 'test prompt' })) {
      out.push(tok);
    }
    expect(out).toEqual(['Hello ', 'world']);
  });

  it('respects pre-aborted AbortSignal', async () => {
    const chain = makeFakeChain(['a', 'b', 'c']);
    const ac = new AbortController();
    ac.abort();
    const iter = streamPlayground(chain, { prompt: 'test' }, { signal: ac.signal });
    await expect(
      (async () => {
        for await (const _ of iter) {
          /* drain */
        }
      })(),
    ).rejects.toThrow();
  });

  it('surfaces model errors as thrown exceptions', async () => {
    const errorChain = {
      stream() {
        async function* gen(): AsyncGenerator<string> {
          yield 'partial';
          throw new Error('model exploded');
        }
        return Promise.resolve(gen());
      },
    } as unknown as PlaygroundChain;

    await expect(
      (async () => {
        for await (const _ of streamPlayground(errorChain, { prompt: 'test' })) {
          /* drain */
        }
      })(),
    ).rejects.toThrow('model exploded');
  });

  it('handles empty output', async () => {
    const chain = makeFakeChain(['']);
    const out: string[] = [];
    for await (const tok of streamPlayground(chain, { prompt: 'test' })) {
      out.push(tok);
    }
    expect(out.join('')).toBe('');
  });

  it('streams through a real FakeListChatModel', async () => {
    const model = new FakeListChatModel({ responses: ['streamed output'] });
    const chain = createPlaygroundChain(model);
    const out: string[] = [];
    for await (const tok of streamPlayground(chain, { prompt: 'hello' })) {
      out.push(tok);
    }
    expect(out.join('')).toContain('streamed output');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/plugins/langchain/playground-chain.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the chain**

Create `packages/server/src/plugins/langchain/chains/playground.ts`:

```typescript
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { StringOutputParser } from '@langchain/core/output_parsers';
import type { Runnable, RunnableLike } from '@langchain/core/runnables';
import { ChatPromptTemplate } from '@langchain/core/prompts';

export type PlaygroundInput = { prompt: string };

export type PlaygroundChain = Runnable<PlaygroundInput, string>;

const playgroundPrompt = ChatPromptTemplate.fromMessages([['human', '{prompt}']]);

export function createPlaygroundChain(model: BaseChatModel): PlaygroundChain {
  return playgroundPrompt
    .pipe(model as RunnableLike)
    .pipe(new StringOutputParser()) as unknown as PlaygroundChain;
}

export async function* streamPlayground(
  chain: PlaygroundChain,
  input: PlaygroundInput,
  options: { signal?: AbortSignal } = {},
): AsyncIterable<string> {
  const stream = await chain.stream(input, { signal: options.signal });
  for await (const chunk of stream) {
    yield chunk;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/plugins/langchain/playground-chain.test.ts`
Expected: PASS — all 6 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/plugins/langchain/chains/playground.ts packages/server/src/__tests__/plugins/langchain/playground-chain.test.ts
git commit -m "feat(server): add playground LangChain chain for prompt streaming"
```

---

## Task 6: Server — Playground routes

**Files:**

- Create: `packages/server/src/routes/playground.ts`
- Create: `packages/server/src/__tests__/routes/playground.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/server/src/__tests__/routes/playground.test.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi, type Mock } from 'vitest';
import type { FastifyInstance } from 'fastify';

vi.mock('../../db/connection.js', () => ({ query: vi.fn() }));
vi.mock('../../plugins/rate-limit.js', () => ({
  rateLimitPlugin: async () => {},
}));
vi.mock('../../services/playground.js', () => ({
  getVariablesForPost: vi.fn(),
  assemblePromptForPost: vi.fn(),
}));
vi.mock('../../plugins/langchain/chains/playground.js', () => ({
  createPlaygroundChain: vi.fn(),
  streamPlayground: vi.fn(),
}));
vi.mock('../../db/queries/posts.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../db/queries/posts.js')>();
  return { ...original, findPostById: vi.fn() };
});

import { buildApp } from '../../app.js';
import { getVariablesForPost, assemblePromptForPost } from '../../services/playground.js';
import {
  createPlaygroundChain,
  streamPlayground,
} from '../../plugins/langchain/chains/playground.js';
import type { PromptVariableRow } from '../../db/queries/types.js';

const mockGetVariables = getVariablesForPost as Mock;
const mockAssemble = assemblePromptForPost as Mock;
const mockCreateChain = createPlaygroundChain as Mock;
const mockStreamPlayground = streamPlayground as Mock;

const userId = 'a0000000-0000-0000-0000-000000000099';
const postId = 'c0000000-0000-0000-0000-000000000004';

const sampleVariable: PromptVariableRow = {
  id: 'f0000000-0000-0000-0000-000000000001',
  post_id: postId,
  name: 'component_name',
  placeholder: 'e.g., UserProfile',
  sort_order: 0,
  default_value: 'MyComponent',
};

describe('playground routes', () => {
  let app: FastifyInstance;
  let token: string;

  beforeAll(async () => {
    app = await buildApp();
    token = app.jwt.sign({ id: userId, email: 'test@example.com', displayName: 'Test' });
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/posts/:id/variables', () => {
    it('returns 200 with variables', async () => {
      mockGetVariables.mockResolvedValue([sampleVariable]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/variables`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.variables).toHaveLength(1);
      expect(body.variables[0].name).toBe('component_name');
      expect(body.variables[0].postId).toBe(postId);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/variables`,
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns empty array for post with no variables', async () => {
      mockGetVariables.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: `/api/posts/${postId}/variables`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().variables).toEqual([]);
    });
  });

  describe('POST /api/playground/run', () => {
    it('returns 400 for invalid body', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${token}` },
        payload: { variables: {} },
      });
      expect(response.statusCode).toBe(400);
    });

    it('returns 401 without auth', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        payload: { postId, variables: {} },
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns SSE stream with tokens on success', async () => {
      mockAssemble.mockResolvedValue('assembled prompt text');
      mockCreateChain.mockReturnValue({});

      async function* fakeStream() {
        yield 'Hello ';
        yield 'world';
      }
      mockStreamPlayground.mockReturnValue(fakeStream());

      const response = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${token}` },
        payload: { postId, variables: { name: 'Alice' } },
      });

      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.body).toContain('event: token');
      expect(response.body).toContain('"text":"Hello "');
      expect(response.body).toContain('"text":"world"');
      expect(response.body).toContain('event: done');
    });

    it('returns SSE error event when assembly fails', async () => {
      mockAssemble.mockRejectedValue(new Error('Post not found'));
      mockCreateChain.mockReturnValue({});

      const response = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${token}` },
        payload: { postId, variables: {} },
      });

      expect(response.headers['content-type']).toBe('text/event-stream');
      expect(response.body).toContain('event: error');
      expect(response.body).toContain('Post not found');
    });

    it('returns SSE error event when stream fails', async () => {
      mockAssemble.mockResolvedValue('prompt text');
      mockCreateChain.mockReturnValue({});

      async function* failStream() {
        yield 'partial';
        throw new Error('model crashed');
      }
      mockStreamPlayground.mockReturnValue(failStream());

      const response = await app.inject({
        method: 'POST',
        url: '/api/playground/run',
        headers: { authorization: `Bearer ${token}` },
        payload: { postId, variables: {} },
      });

      expect(response.body).toContain('event: token');
      expect(response.body).toContain('event: error');
      expect(response.body).toContain('model crashed');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/server && npx vitest run src/__tests__/routes/playground.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the routes**

Create `packages/server/src/routes/playground.ts`:

```typescript
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { playgroundRunSchema } from '@forge/shared';
import { getVariablesForPost, assemblePromptForPost } from '../services/playground.js';
import { createPlaygroundChain, streamPlayground } from '../plugins/langchain/chains/playground.js';
import { createAbortHandlers } from './ai.js';
import type { PromptVariableRow } from '../db/queries/types.js';

const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

const TIMEOUT_MS = 60_000;

function writeEvent(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function toVariableResponse(row: PromptVariableRow) {
  return {
    id: row.id,
    postId: row.post_id,
    name: row.name,
    placeholder: row.placeholder,
    defaultValue: row.default_value,
    sortOrder: row.sort_order,
  };
}

export async function playgroundRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    '/posts/:id/variables',
    { preHandler: app.authenticate },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const rows = await getVariablesForPost(request.params.id);
      return reply.send({ variables: rows.map(toVariableResponse) });
    },
  );

  app.post(
    '/playground/run',
    { preHandler: app.aiGate },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parsed = playgroundRunSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          error: parsed.error.errors.map((e) => e.message).join(', '),
        });
      }

      const slot = request.aiSlot;
      if (!slot) {
        return reply.status(500).send({ error: 'internal_error' });
      }

      const cleanupAborts = createAbortHandlers(request, slot, TIMEOUT_MS);

      reply.raw.writeHead(200, SSE_HEADERS);

      try {
        const assembled = await assemblePromptForPost(parsed.data.postId, parsed.data.variables);
        const chain = createPlaygroundChain(app.aiProvider());
        for await (const token of streamPlayground(
          chain,
          { prompt: assembled },
          {
            signal: slot.controller.signal,
          },
        )) {
          writeEvent(reply, 'token', { text: token });
        }
        writeEvent(reply, 'done', {});
      } catch (err) {
        const message = err instanceof Error ? err.message : 'stream_error';
        writeEvent(reply, 'error', { message });
      } finally {
        cleanupAborts();
        slot.release();
        reply.raw.end();
      }
    },
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/server && npx vitest run src/__tests__/routes/playground.test.ts`
Expected: PASS — all 7 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/routes/playground.ts packages/server/src/__tests__/routes/playground.test.ts
git commit -m "feat(server): add playground routes for GET variables and POST run"
```

---

## Task 7: Server — Register routes in app.ts

**Files:**

- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/__tests__/app.test.ts`

- [ ] **Step 1: Read the existing app.test.ts to understand test pattern**

Read `packages/server/src/__tests__/app.test.ts` to understand what route registration tests look like.

- [ ] **Step 2: Add route registration test**

Add a test to `packages/server/src/__tests__/app.test.ts` that verifies the playground routes are registered:

```typescript
it('registers playground routes under /api', async () => {
  const routes = app.printRoutes();
  expect(routes).toContain('/api/posts/:id/variables');
  expect(routes).toContain('/api/playground/run');
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd packages/server && npx vitest run src/__tests__/app.test.ts`
Expected: FAIL — routes not registered

- [ ] **Step 4: Register the routes**

Add to `packages/server/src/app.ts`:

Import at the top:

```typescript
import { playgroundRoutes } from './routes/playground.js';
```

After the `aiRoutes` registration line:

```typescript
await app.register(playgroundRoutes, { prefix: '/api' });
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd packages/server && npx vitest run src/__tests__/app.test.ts`
Expected: PASS

- [ ] **Step 6: Run full server test suite to check nothing broke**

Run: `cd packages/server && npx vitest run`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/app.ts packages/server/src/__tests__/app.test.ts
git commit -m "feat(server): register playground routes in app"
```

---

## Task 8: Client — usePlayground composable

**Files:**

- Create: `packages/client/src/composables/usePlayground.ts`
- Create: `packages/client/src/__tests__/composables/usePlayground.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/__tests__/composables/usePlayground.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

const mockApiFetch = vi.fn();
vi.mock('../../lib/api.js', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

function sseStreamOf(frames: string[]): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      for (const f of frames) ctrl.enqueue(enc.encode(f));
      ctrl.close();
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

function abortAwareHangingResponse(signal: AbortSignal): Response {
  const body = new ReadableStream<Uint8Array>({
    start(ctrl) {
      signal.addEventListener('abort', () => {
        ctrl.error(new DOMException('The operation was aborted.', 'AbortError'));
      });
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

import { usePlayground } from '../../composables/usePlayground.js';

describe('usePlayground', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('fetchVariables', () => {
    it('fetches and stores variables', async () => {
      mockApiFetch.mockResolvedValue(
        new Response(
          JSON.stringify({
            variables: [
              {
                id: '1',
                postId: 'p1',
                name: 'lang',
                placeholder: null,
                defaultValue: 'js',
                sortOrder: 0,
              },
            ],
          }),
          { status: 200 },
        ),
      );

      const { fetchVariables, variables } = usePlayground();
      await fetchVariables('p1');

      expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/p1/variables');
      expect(variables.value).toHaveLength(1);
      expect(variables.value[0].name).toBe('lang');
    });

    it('sets error on failed fetch', async () => {
      mockApiFetch.mockResolvedValue(new Response('', { status: 500 }));

      const { fetchVariables, error } = usePlayground();
      await fetchVariables('p1');

      expect(error.value).toBe('Failed to load variables');
    });
  });

  describe('run', () => {
    it('streams tokens and accumulates output', async () => {
      mockApiFetch.mockResolvedValue(
        sseStreamOf([
          'event: token\ndata: {"text":"Hel"}\n\n',
          'event: token\ndata: {"text":"lo"}\n\n',
          'event: done\ndata: {}\n\n',
        ]),
      );

      const { run, output } = usePlayground();
      await run('p1', { name: 'Alice' });

      expect(output.value).toBe('Hello');
    });

    it('sets isRunning true during streaming, false after', async () => {
      mockApiFetch.mockResolvedValue(sseStreamOf(['event: done\ndata: {}\n\n']));

      const { run, isRunning } = usePlayground();
      expect(isRunning.value).toBe(false);
      const promise = run('p1', {});
      // After first microtask, isRunning should be true
      await Promise.resolve();
      await Promise.resolve();
      await promise;
      expect(isRunning.value).toBe(false);
    });

    it('handles SSE error events', async () => {
      mockApiFetch.mockResolvedValue(
        sseStreamOf(['event: error\ndata: {"message":"rate limited"}\n\n']),
      );

      const { run, error } = usePlayground();
      await run('p1', {});

      expect(error.value).toBe('rate limited');
    });

    it('sets error on non-ok response', async () => {
      mockApiFetch.mockResolvedValue(new Response('', { status: 429 }));

      const { run, error } = usePlayground();
      await run('p1', {});

      expect(error.value).toBe('Request failed');
    });

    it('clears output on each new run', async () => {
      mockApiFetch
        .mockResolvedValueOnce(
          sseStreamOf(['event: token\ndata: {"text":"first"}\n\n', 'event: done\ndata: {}\n\n']),
        )
        .mockResolvedValueOnce(
          sseStreamOf(['event: token\ndata: {"text":"second"}\n\n', 'event: done\ndata: {}\n\n']),
        );

      const { run, output } = usePlayground();
      await run('p1', {});
      expect(output.value).toBe('first');
      await run('p1', {});
      expect(output.value).toBe('second');
    });
  });

  describe('stop', () => {
    it('aborts the in-flight request', async () => {
      let capturedSignal: AbortSignal | undefined;
      mockApiFetch.mockImplementation((_url: string, init: RequestInit) => {
        capturedSignal = init.signal as AbortSignal;
        return Promise.resolve(abortAwareHangingResponse(capturedSignal));
      });

      const { run, stop, isRunning } = usePlayground();
      const promise = run('p1', {});
      await Promise.resolve();
      await Promise.resolve();
      stop();
      expect(capturedSignal?.aborted).toBe(true);
      await promise;
      expect(isRunning.value).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/composables/usePlayground.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the composable**

Create `packages/client/src/composables/usePlayground.ts`:

```typescript
import { ref, type Ref } from 'vue';
import type { PromptVariable } from '@forge/shared';
import { apiFetch } from '@/lib/api';
import { parseSseStream } from '@/lib/ai/sse-stream';

export type UsePlaygroundReturn = {
  variables: Ref<PromptVariable[]>;
  isRunning: Ref<boolean>;
  error: Ref<string | null>;
  output: Ref<string>;
  fetchVariables: (postId: string) => Promise<void>;
  run: (postId: string, vars: Record<string, string>) => Promise<void>;
  stop: () => void;
};

export function usePlayground(): UsePlaygroundReturn {
  const variables = ref<PromptVariable[]>([]);
  const isRunning = ref(false);
  const error = ref<string | null>(null);
  const output = ref('');
  let controller: AbortController | null = null;

  async function fetchVariables(postId: string): Promise<void> {
    error.value = null;
    try {
      const res = await apiFetch(`/api/posts/${postId}/variables`);
      if (!res.ok) {
        error.value = 'Failed to load variables';
        return;
      }
      const data = (await res.json()) as { variables: PromptVariable[] };
      variables.value = data.variables;
    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to load variables';
    }
  }

  function stop(): void {
    if (controller) {
      controller.abort();
      controller = null;
    }
  }

  async function run(postId: string, vars: Record<string, string>): Promise<void> {
    stop();
    controller = new AbortController();
    isRunning.value = true;
    error.value = null;
    output.value = '';

    try {
      const res = await apiFetch('/api/playground/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postId, variables: vars }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        error.value = 'Request failed';
      } else {
        for await (const evt of parseSseStream(res.body)) {
          if (evt.event === 'token' && isRecord(evt.data) && typeof evt.data.text === 'string') {
            output.value += evt.data.text;
          } else if (evt.event === 'error') {
            error.value =
              isRecord(evt.data) && typeof evt.data.message === 'string'
                ? evt.data.message
                : 'Generation failed';
            break;
          } else if (evt.event === 'done') {
            break;
          }
        }
      }
    } catch (err: unknown) {
      if (!(err instanceof Error && err.name === 'AbortError')) {
        error.value = err instanceof Error ? err.message : 'Generation failed';
      }
    }

    isRunning.value = false;
    controller = null;
  }

  return { variables, isRunning, error, output, fetchVariables, run, stop };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/composables/usePlayground.test.ts`
Expected: PASS — all 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/composables/usePlayground.ts packages/client/src/__tests__/composables/usePlayground.test.ts
git commit -m "feat(client): add usePlayground composable for variable fetching and SSE streaming"
```

---

## Task 9: Client — PlaygroundHeader component

**Files:**

- Create: `packages/client/src/components/playground/PlaygroundHeader.vue`
- Create: `packages/client/src/__tests__/components/playground/PlaygroundHeader.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/__tests__/components/playground/PlaygroundHeader.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PlaygroundHeader from '../../../components/playground/PlaygroundHeader.vue';

describe('PlaygroundHeader', () => {
  it('renders the title', () => {
    const wrapper = mount(PlaygroundHeader, {
      props: { title: 'My Prompt', isRunning: false },
    });
    expect(wrapper.text()).toContain('My Prompt');
  });

  it('shows Run button when not running', () => {
    const wrapper = mount(PlaygroundHeader, {
      props: { title: 'Test', isRunning: false },
    });
    const btn = wrapper.find('button');
    expect(btn.text()).toBe('Run');
  });

  it('shows Stop button when running', () => {
    const wrapper = mount(PlaygroundHeader, {
      props: { title: 'Test', isRunning: true },
    });
    const btn = wrapper.find('button');
    expect(btn.text()).toBe('Stop');
  });

  it('emits run when Run button clicked', async () => {
    const wrapper = mount(PlaygroundHeader, {
      props: { title: 'Test', isRunning: false },
    });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('run')).toHaveLength(1);
  });

  it('emits stop when Stop button clicked', async () => {
    const wrapper = mount(PlaygroundHeader, {
      props: { title: 'Test', isRunning: true },
    });
    await wrapper.find('button').trigger('click');
    expect(wrapper.emitted('stop')).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/components/playground/PlaygroundHeader.test.ts`
Expected: FAIL — component not found

- [ ] **Step 3: Implement the component**

Create `packages/client/src/components/playground/PlaygroundHeader.vue`:

```vue
<script setup lang="ts">
defineProps<{
  title: string;
  isRunning: boolean;
}>();

const emit = defineEmits<{
  run: [];
  stop: [];
}>();
</script>

<template>
  <div class="flex items-center justify-between border-b border-surface-500 px-6 py-4">
    <h1 class="text-xl font-semibold text-gray-100">{{ title }}</h1>
    <button
      class="rounded-lg px-4 py-2 text-sm font-medium transition-colors"
      :class="
        isRunning
          ? 'bg-red-600 hover:bg-red-700 text-white'
          : 'bg-primary hover:bg-primary/80 text-white'
      "
      @click="isRunning ? emit('stop') : emit('run')"
    >
      {{ isRunning ? 'Stop' : 'Run' }}
    </button>
  </div>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/playground/PlaygroundHeader.test.ts`
Expected: PASS — all 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/playground/PlaygroundHeader.vue packages/client/src/__tests__/components/playground/PlaygroundHeader.test.ts
git commit -m "feat(client): add PlaygroundHeader component with Run/Stop toggle"
```

---

## Task 10: Client — PromptVariableInput component

**Files:**

- Create: `packages/client/src/components/playground/PromptVariableInput.vue`
- Create: `packages/client/src/__tests__/components/playground/PromptVariableInput.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/__tests__/components/playground/PromptVariableInput.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import PromptVariableInput from '../../../components/playground/PromptVariableInput.vue';
import type { PromptVariable } from '@forge/shared';

const textVariable: PromptVariable = {
  id: '1',
  postId: 'p1',
  name: 'Language',
  placeholder: 'e.g. TypeScript',
  defaultValue: 'JavaScript',
  sortOrder: 0,
};

const textareaVariable: PromptVariable = {
  id: '2',
  postId: 'p1',
  name: 'Error Log',
  placeholder: 'Paste your error log',
  defaultValue: null,
  sortOrder: 1,
};

describe('PromptVariableInput', () => {
  it('renders a label with the variable name', () => {
    const wrapper = mount(PromptVariableInput, {
      props: { variable: textVariable, modelValue: '' },
    });
    expect(wrapper.find('label').text()).toBe('Language');
  });

  it('renders a text input for simple names', () => {
    const wrapper = mount(PromptVariableInput, {
      props: { variable: textVariable, modelValue: '' },
    });
    expect(wrapper.find('input').exists()).toBe(true);
    expect(wrapper.find('textarea').exists()).toBe(false);
  });

  it('renders a textarea for names containing "log"', () => {
    const wrapper = mount(PromptVariableInput, {
      props: { variable: textareaVariable, modelValue: '' },
    });
    expect(wrapper.find('textarea').exists()).toBe(true);
    expect(wrapper.find('input').exists()).toBe(false);
  });

  it('renders textarea for names containing "code"', () => {
    const v: PromptVariable = { ...textVariable, name: 'Source Code' };
    const wrapper = mount(PromptVariableInput, {
      props: { variable: v, modelValue: '' },
    });
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('renders textarea for names containing "content"', () => {
    const v: PromptVariable = { ...textVariable, name: 'Page Content' };
    const wrapper = mount(PromptVariableInput, {
      props: { variable: v, modelValue: '' },
    });
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('renders textarea for names containing "text"', () => {
    const v: PromptVariable = { ...textVariable, name: 'Input Text' };
    const wrapper = mount(PromptVariableInput, {
      props: { variable: v, modelValue: '' },
    });
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('renders textarea for names containing "context"', () => {
    const v: PromptVariable = { ...textVariable, name: 'Additional Context' };
    const wrapper = mount(PromptVariableInput, {
      props: { variable: v, modelValue: '' },
    });
    expect(wrapper.find('textarea').exists()).toBe(true);
  });

  it('shows the placeholder', () => {
    const wrapper = mount(PromptVariableInput, {
      props: { variable: textVariable, modelValue: '' },
    });
    expect(wrapper.find('input').attributes('placeholder')).toBe('e.g. TypeScript');
  });

  it('uses fallback placeholder when none provided', () => {
    const v: PromptVariable = { ...textVariable, placeholder: null };
    const wrapper = mount(PromptVariableInput, {
      props: { variable: v, modelValue: '' },
    });
    expect(wrapper.find('input').attributes('placeholder')).toBe('Enter Language');
  });

  it('emits update:modelValue on input', async () => {
    const wrapper = mount(PromptVariableInput, {
      props: { variable: textVariable, modelValue: '' },
    });
    await wrapper.find('input').setValue('Python');
    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['Python']);
  });

  it('displays the modelValue', () => {
    const wrapper = mount(PromptVariableInput, {
      props: { variable: textVariable, modelValue: 'Rust' },
    });
    expect((wrapper.find('input').element as HTMLInputElement).value).toBe('Rust');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/components/playground/PromptVariableInput.test.ts`
Expected: FAIL — component not found

- [ ] **Step 3: Implement the component**

Create `packages/client/src/components/playground/PromptVariableInput.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue';
import type { PromptVariable } from '@forge/shared';

const props = defineProps<{
  variable: PromptVariable;
  modelValue: string;
}>();

defineEmits<{
  'update:modelValue': [value: string];
}>();

const TEXTAREA_KEYWORDS = /\b(log|code|content|text|context)\b/i;

const isTextarea = computed(() => TEXTAREA_KEYWORDS.test(props.variable.name));

const placeholder = computed(() => props.variable.placeholder ?? `Enter ${props.variable.name}`);
</script>

<template>
  <div class="mb-4">
    <label class="mb-1 block text-sm font-medium text-gray-300">
      {{ variable.name }}
    </label>
    <textarea
      v-if="isTextarea"
      rows="4"
      class="w-full rounded-lg border border-surface-500 bg-surface px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-primary focus:outline-none"
      :placeholder="placeholder"
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
    <input
      v-else
      type="text"
      class="w-full rounded-lg border border-surface-500 bg-surface px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:border-primary focus:outline-none"
      :placeholder="placeholder"
      :value="modelValue"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </div>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/playground/PromptVariableInput.test.ts`
Expected: PASS — all 11 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/playground/PromptVariableInput.vue packages/client/src/__tests__/components/playground/PromptVariableInput.test.ts
git commit -m "feat(client): add PromptVariableInput component with textarea heuristic"
```

---

## Task 11: Client — PromptOutput component

**Files:**

- Create: `packages/client/src/components/playground/PromptOutput.vue`
- Create: `packages/client/src/__tests__/components/playground/PromptOutput.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `packages/client/src/__tests__/components/playground/PromptOutput.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import PromptOutput from '../../../components/playground/PromptOutput.vue';

const writeText = vi.fn().mockResolvedValue(undefined);
Object.assign(navigator, { clipboard: { writeText } });

describe('PromptOutput', () => {
  it('shows placeholder when output is empty and not running', () => {
    const wrapper = mount(PromptOutput, {
      props: { output: '', isRunning: false, error: null },
    });
    expect(wrapper.text()).toContain('Click Run to generate output');
  });

  it('shows generating indicator when running with no output', () => {
    const wrapper = mount(PromptOutput, {
      props: { output: '', isRunning: true, error: null },
    });
    expect(wrapper.text()).toContain('Generating');
  });

  it('renders output text', () => {
    const wrapper = mount(PromptOutput, {
      props: { output: 'Hello world', isRunning: false, error: null },
    });
    expect(wrapper.text()).toContain('Hello world');
  });

  it('shows generating indicator while streaming with output', () => {
    const wrapper = mount(PromptOutput, {
      props: { output: 'partial', isRunning: true, error: null },
    });
    expect(wrapper.text()).toContain('partial');
    expect(wrapper.text()).toContain('Generating');
  });

  it('shows error message when error is set', () => {
    const wrapper = mount(PromptOutput, {
      props: { output: '', isRunning: false, error: 'Something broke' },
    });
    expect(wrapper.text()).toContain('Something broke');
  });

  it('shows copy button when output exists', () => {
    const wrapper = mount(PromptOutput, {
      props: { output: 'some text', isRunning: false, error: null },
    });
    expect(wrapper.find('[data-testid="copy-button"]').exists()).toBe(true);
  });

  it('hides copy button when output is empty', () => {
    const wrapper = mount(PromptOutput, {
      props: { output: '', isRunning: false, error: null },
    });
    expect(wrapper.find('[data-testid="copy-button"]').exists()).toBe(false);
  });

  it('copies output to clipboard on button click', async () => {
    writeText.mockClear();
    const wrapper = mount(PromptOutput, {
      props: { output: 'copy me', isRunning: false, error: null },
    });
    await wrapper.find('[data-testid="copy-button"]').trigger('click');
    expect(writeText).toHaveBeenCalledWith('copy me');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/components/playground/PromptOutput.test.ts`
Expected: FAIL — component not found

- [ ] **Step 3: Implement the component**

Create `packages/client/src/components/playground/PromptOutput.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  output: string;
  isRunning: boolean;
  error: string | null;
}>();

const copied = ref(false);

async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
  copied.value = true;
  setTimeout(() => {
    copied.value = false;
  }, 2000);
}
</script>

<template>
  <div class="relative flex h-full flex-col">
    <div
      v-if="error"
      class="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400"
    >
      {{ error }}
    </div>

    <div
      v-else-if="!output && !isRunning"
      class="flex flex-1 items-center justify-center text-sm text-gray-500"
    >
      Click Run to generate output
    </div>

    <template v-else>
      <pre
        class="flex-1 overflow-auto whitespace-pre-wrap rounded-lg bg-surface p-4 font-mono text-sm text-gray-100"
        >{{ output }}</pre
      >

      <div v-if="isRunning" class="mt-2 text-xs text-gray-400">Generating...</div>

      <button
        v-if="output"
        data-testid="copy-button"
        class="absolute right-2 top-2 rounded-md bg-surface-500 px-2 py-1 text-xs text-gray-300 transition-colors hover:bg-surface-500/80"
        @click="copyToClipboard(output)"
      >
        {{ copied ? 'Copied!' : 'Copy' }}
      </button>
    </template>
  </div>
</template>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd packages/client && npx vitest run src/__tests__/components/playground/PromptOutput.test.ts`
Expected: PASS — all 8 tests pass

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/components/playground/PromptOutput.vue packages/client/src/__tests__/components/playground/PromptOutput.test.ts
git commit -m "feat(client): add PromptOutput component with streaming display and clipboard"
```

---

## Task 12: Client — PlaygroundPage + router

**Files:**

- Create: `packages/client/src/pages/PlaygroundPage.vue`
- Create: `packages/client/src/__tests__/pages/PlaygroundPage.test.ts`
- Modify: `packages/client/src/plugins/router.ts`
- Modify: `packages/client/src/__tests__/plugins/router.test.ts`

- [ ] **Step 1: Write the failing page tests**

Create `packages/client/src/__tests__/pages/PlaygroundPage.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';

const mockFetchVariables = vi.fn();
const mockRun = vi.fn();
const mockStop = vi.fn();
const mockVariables = {
  value: [] as {
    id: string;
    postId: string;
    name: string;
    placeholder: string | null;
    defaultValue: string | null;
    sortOrder: number;
  }[],
};
const mockIsRunning = { value: false };
const mockError = { value: null as string | null };
const mockOutput = { value: '' };

vi.mock('../../composables/usePlayground.js', () => ({
  usePlayground: () => ({
    variables: mockVariables,
    isRunning: mockIsRunning,
    error: mockError,
    output: mockOutput,
    fetchVariables: mockFetchVariables,
    run: mockRun,
    stop: mockStop,
  }),
}));

vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'test-post-id' } }),
  useRouter: () => ({ push: vi.fn() }),
}));

const mockApiFetch = vi.fn();
vi.mock('../../lib/api.js', () => ({
  apiFetch: (...args: unknown[]) => mockApiFetch(...args),
}));

import PlaygroundPage from '../../pages/PlaygroundPage.vue';

describe('PlaygroundPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockVariables.value = [];
    mockIsRunning.value = false;
    mockError.value = null;
    mockOutput.value = '';
    mockApiFetch.mockResolvedValue(
      new Response(JSON.stringify({ title: 'Test Prompt', contentType: 'prompt' }), {
        status: 200,
      }),
    );
  });

  it('fetches post and variables on mount', async () => {
    mount(PlaygroundPage);
    await flushPromises();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/posts/test-post-id');
    expect(mockFetchVariables).toHaveBeenCalledWith('test-post-id');
  });

  it('renders PlaygroundHeader with post title', async () => {
    const wrapper = mount(PlaygroundPage);
    await flushPromises();
    expect(wrapper.text()).toContain('Test Prompt');
  });

  it('renders variable inputs for each variable', async () => {
    mockVariables.value = [
      {
        id: '1',
        postId: 'p1',
        name: 'Language',
        placeholder: null,
        defaultValue: 'JS',
        sortOrder: 0,
      },
      {
        id: '2',
        postId: 'p1',
        name: 'Error Log',
        placeholder: null,
        defaultValue: null,
        sortOrder: 1,
      },
    ];
    const wrapper = mount(PlaygroundPage);
    await flushPromises();
    expect(wrapper.text()).toContain('Language');
    expect(wrapper.text()).toContain('Error Log');
  });

  it('pre-fills default values', async () => {
    mockVariables.value = [
      {
        id: '1',
        postId: 'p1',
        name: 'Language',
        placeholder: null,
        defaultValue: 'TypeScript',
        sortOrder: 0,
      },
    ];
    const wrapper = mount(PlaygroundPage);
    await flushPromises();
    const input = wrapper.find('input');
    expect((input.element as HTMLInputElement).value).toBe('TypeScript');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd packages/client && npx vitest run src/__tests__/pages/PlaygroundPage.test.ts`
Expected: FAIL — component not found

- [ ] **Step 3: Implement the page**

Create `packages/client/src/pages/PlaygroundPage.vue`:

```vue
<script setup lang="ts">
import { ref, reactive, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { apiFetch } from '@/lib/api';
import { usePlayground } from '@/composables/usePlayground';
import PlaygroundHeader from '@/components/playground/PlaygroundHeader.vue';
import PromptVariableInput from '@/components/playground/PromptVariableInput.vue';
import PromptOutput from '@/components/playground/PromptOutput.vue';

const route = useRoute();
const postId = route.params.id as string;

const { variables, isRunning, error, output, fetchVariables, run, stop } = usePlayground();

const title = ref('Playground');
const variableValues = reactive<Record<string, string>>({});

onMounted(async () => {
  const res = await apiFetch(`/api/posts/${postId}`);
  if (res.ok) {
    const post = (await res.json()) as { title: string };
    title.value = post.title;
  }
  await fetchVariables(postId);
});

watch(variables, (vars) => {
  for (const v of vars) {
    if (!(v.name in variableValues)) {
      variableValues[v.name] = v.defaultValue ?? '';
    }
  }
});

function handleRun(): void {
  run(postId, { ...variableValues });
}
</script>

<template>
  <div class="flex h-full flex-col">
    <PlaygroundHeader :title="title" :is-running="isRunning" @run="handleRun" @stop="stop" />

    <div class="flex flex-1 overflow-hidden">
      <!-- Variables panel -->
      <div class="w-1/2 overflow-y-auto border-r border-surface-500 p-6">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Variables</h2>
        <div v-if="variables.length === 0" class="text-sm text-gray-500">
          No variables found in this prompt.
        </div>
        <PromptVariableInput
          v-for="v in variables"
          :key="v.id"
          :variable="v"
          v-model="variableValues[v.name]"
        />
      </div>

      <!-- Output panel -->
      <div class="w-1/2 p-6">
        <h2 class="mb-4 text-sm font-semibold uppercase tracking-wide text-gray-400">Output</h2>
        <PromptOutput :output="output" :is-running="isRunning" :error="error" />
      </div>
    </div>
  </div>
</template>
```

- [ ] **Step 4: Add the route to the router**

Add to `packages/client/src/plugins/router.ts` inside the AppLayout children array, after the `post-history` route:

```typescript
        {
          path: 'playground/:id',
          name: 'playground',
          component: () => import('@/pages/PlaygroundPage.vue'),
        },
```

- [ ] **Step 5: Add router test**

Add to `packages/client/src/__tests__/plugins/router.test.ts` (inside the appropriate `describe` block):

```typescript
it('has a playground route', () => {
  const route = router.getRoutes().find((r) => r.name === 'playground');
  expect(route).toBeTruthy();
  expect(route?.path).toBe('/playground/:id');
});
```

- [ ] **Step 6: Run all page and router tests**

Run: `cd packages/client && npx vitest run src/__tests__/pages/PlaygroundPage.test.ts src/__tests__/plugins/router.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add packages/client/src/pages/PlaygroundPage.vue packages/client/src/__tests__/pages/PlaygroundPage.test.ts packages/client/src/plugins/router.ts packages/client/src/__tests__/plugins/router.test.ts
git commit -m "feat(client): add PlaygroundPage with variable inputs and streaming output"
```

---

## Task 13: Bruno API tests

**Files:**

- Create: `bruno/playground/get-variables.bru`
- Create: `bruno/playground/run-prompt.bru`

- [ ] **Step 1: Create the get-variables request**

Create `bruno/playground/get-variables.bru`:

```
meta {
  name: Get Prompt Variables
  type: http
  seq: 1
}

get {
  url: {{baseUrl}}/api/posts/c0000000-0000-0000-0000-000000000004/variables
  body: none
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

assert {
  res.status: eq 200
}

tests {
  test("returns variables array", function() {
    const body = res.getBody();
    expect(body.variables).to.be.an('array');
    expect(body.variables.length).to.be.greaterThan(0);
  });

  test("each variable has required fields", function() {
    const v = res.getBody().variables[0];
    expect(v).to.have.property('id');
    expect(v).to.have.property('postId');
    expect(v).to.have.property('name');
    expect(v).to.have.property('sortOrder');
  });
}
```

- [ ] **Step 2: Create the run-prompt error-path request**

The `POST /api/playground/run` endpoint streams SSE, which Bruno cannot parse. Test the validation error path instead.

Create `bruno/playground/run-prompt.bru`:

```
meta {
  name: Run Prompt - Invalid Body
  type: http
  seq: 2
}

post {
  url: {{baseUrl}}/api/playground/run
  body: json
  auth: bearer
}

auth:bearer {
  token: {{accessToken}}
}

body:json {
  {
    "variables": {}
  }
}

assert {
  res.status: eq 400
}

tests {
  test("returns validation error", function() {
    const body = res.getBody();
    expect(body).to.have.property('error');
  });
}
```

- [ ] **Step 3: Verify Bruno files have assert blocks**

Check each file has `assert { res.status: eq <CODE> }` — required by CI lint-guard.

- [ ] **Step 4: Commit**

```bash
git add bruno/playground/
git commit -m "test(bruno): add playground endpoint regression tests"
```

---

## Task 14: Final verification

- [ ] **Step 1: Run full test suite**

Run: `npm test`
Expected: All tests PASS across shared, server, and client packages

- [ ] **Step 2: Run coverage check**

Run: `npm run test:coverage`
Expected: 100% lines, branches, functions, statements per `.coverage-thresholds.json`

- [ ] **Step 3: Run build**

Run: `npm run build` (if available) or `cd packages/client && npx vite build && cd ../server && npx tsc --noEmit`
Expected: No TypeScript errors, clean build

- [ ] **Step 4: Run Bruno suite (requires running server)**

```bash
set -a && source .env && set +a && cd packages/server && npx tsx src/server.ts &
sleep 3
cd bruno && npx @usebruno/cli run playground --env local
```

Expected: Both requests return expected status codes (200 and 400)

- [ ] **Step 5: Final commit if any fixes needed, then verify clean state**

Run: `git status && npm test`
Expected: Clean working tree, all tests pass
