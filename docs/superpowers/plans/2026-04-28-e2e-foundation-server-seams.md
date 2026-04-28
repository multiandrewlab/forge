# E2E Foundation Server Seams Implementation Plan

> **For agentic workers:** Steps use checkbox (`- [ ]`) syntax for tracking. Per `CLAUDE.md`, the user picks the execution method (orchestrated / subagent-driven / parallel session) before this plan begins; do NOT auto-select. See the **Execution-method choice** section at the bottom.

**Goal:** Land the server-side seams that the E2E Playwright suite depends on — mock LangChain provider, gated `__test__/reset` endpoint, env-guard helpers, seed-script production guard — and update the Bruno CI workflow + `ai/complete.bru` to use the new mock provider. No Playwright specs are added in this plan; that lives in issue #45 (1b).

## Subagent discipline (mandatory, per CLAUDE.md)

All agents executing this plan MUST follow these rules:
- **TDD throughout.** Every code-creating task in this plan starts with a failing test, watches it fail, implements the minimum to pass, then commits. Do not invert this order.
- **NEVER use `--no-verify` on `git commit`.** Pre-commit hooks exist for a reason. If a hook fails, fix the root cause, re-stage, create a NEW commit (do not amend).
- **NEVER use `git push --force` (or `--force-with-lease` without explicit user approval).** This applies to every branch, especially main.
- **STAY within declared file scope.** The "Files" header at the top of each task names what may be touched. If a file outside that scope appears to need changes, stop and ask.
- **Coverage gate is BLOCKING.** Do not skip Step 13.1's `npm run test:coverage` — and do not lower thresholds in `.coverage-thresholds.json` to make a failure go away.
- **Bruno gate is BLOCKING.** Do not skip Step 13.2.

**Architecture:** Add three new files under `packages/server/src/` (env-guards lib, mock LangChain provider + scripts registry, gated test routes), modify the existing LangChain provider switch to add a `'mock'` case, wire the new test routes through `app.ts` only when `ENABLE_TEST_ROUTES=1`, and add a boot-time fail-fast in `server.ts` that refuses startup when production is paired with any test-mode flag. Six layers of defense protect the destructive reset endpoint: NODE_ENV allowlist, strict env parsing, bind-address guard, route-registration gate, per-boot `X-E2E-Secret` header, and Origin header rejection. The mock provider implements LangChain's `BaseChatModel` interface and uses `AsyncLocalStorage` to thread per-request `X-Mock-Script` script selection through the existing `cachedModel` singleton.

**Tech Stack:** TypeScript (strict, ESM), Fastify, LangChain (`@langchain/core`), Node `node:async_hooks`, Node `node:crypto`, Vitest 100% coverage, `pg` (Postgres advisory locks), Bruno.

**Issue:** [#44](https://github.com/multiandrewlab/forge/issues/44)
**Design:** `docs/superpowers/specs/2026-04-28-e2e-playwright-testing-design.md` (commit `322a837`)

---

## File Structure

| Path | Action | Responsibility |
| --- | --- | --- |
| `packages/server/src/lib/env-guards.ts` | Create | `isE2EFlagSet`, `assertProductionGuards`, `generateE2ESecret` |
| `packages/server/src/__tests__/lib/env-guards.test.ts` | Create | 100% coverage of the above |
| `packages/server/src/lib/bootstrap.ts` | Create | `runBootGuards(env, hooks)` — testable wrapper used by `server.ts` so the boot fail-fast has its own Vitest test |
| `packages/server/src/__tests__/lib/bootstrap.test.ts` | Create | 100% coverage of `runBootGuards` including the `onError` + `onExit` hook paths |
| `packages/server/src/plugins/langchain/mock-scripts.ts` | Create | Hardcoded SSE-chunk registry + `DEFAULT_SCRIPT_KEY` |
| `packages/server/src/__tests__/plugins/langchain/mock-scripts.test.ts` | Create | Registry-shape + default-fallback coverage |
| `packages/shared/src/types/mock-script-keys.ts` | Create | Type-only export of `MockScriptKey` (excluded from coverage, mirrors existing type-file pattern) |
| `packages/server/src/plugins/langchain/mock-provider.ts` | Create | `ChatMock extends BaseChatModel` + `mockScriptStorage` AsyncLocalStorage |
| `packages/server/src/__tests__/plugins/langchain/mock-provider.test.ts` | Create | 100% coverage including AsyncLocalStorage threading |
| `packages/server/src/plugins/langchain/provider.ts` | Modify | Add `case 'mock':` with production-throw guard |
| `packages/server/src/__tests__/plugins/langchain/provider.test.ts` | Modify | Cover new case + production-throw branch |
| `packages/server/src/plugins/langchain/index.ts` | Modify | Add `mockScriptHeaderHook` (no-op when LLM_PROVIDER ≠ mock) |
| `packages/server/src/__tests__/plugins/langchain/plugin.test.ts` | Modify | Cover both branches of the hook |
| `packages/server/src/routes/__test__.ts` | Create | `registerTestRoutes(app)` with six-layer gating + reset handler |
| `packages/server/src/__tests__/routes/__test__.test.ts` | Create | 100% coverage of every gate branch + handler |
| `packages/server/src/app.ts` | Modify | Register test routes when flag set |
| `packages/server/src/__tests__/app.test.ts` | Modify | Cover the conditional registration branch |
| `packages/server/src/server.ts` | Modify | Call `assertProductionGuards` before `buildApp()` |
| `scripts/seed-guard.ts` | Create | DATABASE_URL parser + refusal logic + `psql` exec |
| `packages/server/src/__tests__/scripts/seed-guard.test.ts` | Create | 100% coverage of URL-parsing branches |
| `packages/server/src/__tests__/scripts/seed-sql-shape.test.ts` | Create | Asserts `scripts/seed.sql` contains no `psql` meta-commands |
| `packages/server/package.json` | Modify | `seed` script invokes the guard wrapper |
| `vitest.config.ts` | Modify | Add `test.exclude: ['e2e/**']` + add `packages/shared/src/types/mock-script-keys.ts` to coverage exclude |
| `.github/workflows/bruno-regression.yml` | Modify | Add `LLM_PROVIDER=mock`, `ENABLE_TEST_ROUTES=1`, `E2E_MODE=1`, `NODE_ENV=test` |
| `bruno/ai/complete.bru` | Modify | Assert deterministic mock-provider SSE output |
| `bruno/README.md` | Modify | Replace `OPENAI_API_KEY` troubleshooting note with mock-provider note |

**Decisions locked at plan-write time** (per CTO suggestion to avoid the "agent picks the path of least resistance"):

1. **Shared type lives at `packages/shared/src/types/mock-script-keys.ts`** (filename matches the issue body's named scope, but directory is `types/` not `llm/`). Implemented as `.ts` (not `.d.ts`) to match the existing `packages/shared/src/types/*.ts` pattern (e.g., `user.ts`, `post.ts`). Added to `vitest.config.ts` `coverage.exclude` array alongside the other type-only files. No runtime code, no Vitest test required for it.

   **Issue divergence note:** issue #44's File Scope names `packages/shared/src/llm/mock-script-keys.{ts,d.ts}`. This plan places the file under `types/` instead of a new top-level `llm/` directory because the existing `packages/shared/src/` has only two top-level subdirectories (`types/`, `validators/`, `constants/`) and no `llm/`. Type-only files in this project consistently live under `types/`. The plan keeps the issue-named filename `mock-script-keys.ts` to preserve the symbolic link to the issue body. The PR description for #1a should call out the directory deviation explicitly so future readers find it.

2. **`scripts/seed-guard.ts` lives at repo root** (not `packages/server/scripts/`). Co-located with `scripts/seed.sql` per architect suggestion #4. Invoked from `packages/server/package.json` via `tsx ../../scripts/seed-guard.ts`.

3. **Reset endpoint executes `seed.sql` via `pg.Client.query(seedSql)`** using node-postgres' simple-query protocol (which DOES support multi-statement queries; the existing seed.sql opens with `BEGIN;` and closes with `COMMIT;`). The `seed-sql-shape` test ensures no future `psql` meta-commands break this. If a TDD step for the reset handler reveals the pg driver does NOT handle multi-statement, the fallback is `child_process.execFile('psql', ...)` — but try the cleaner approach first.

4. **Postgres advisory lock key:** `0xE2E5E70n` (the hex for "E2E5E70" reads as "E2E SERV ER" — mnemonic, deterministic, exported as a named constant `E2E_RESET_LOCK_ID` from `routes/__test__.ts`).

5. **Coverage configuration:** the new file `packages/shared/src/types/mock-script-keys.ts` is added to `vitest.config.ts` `coverage.exclude`. No other coverage-config changes needed (e2e/ is already excluded by the `coverage.include` glob).

---

## Task 1: Env-guards library

**Files:**
- Create: `packages/server/src/lib/env-guards.ts`
- Test: `packages/server/src/__tests__/lib/env-guards.test.ts`

This is the foundational module everything else depends on. Three exports: `isE2EFlagSet`, `assertProductionGuards`, `generateE2ESecret`.

- [ ] **Step 1.1: Write failing test for `isE2EFlagSet` — accepts literal `'1'`**

Create `packages/server/src/__tests__/lib/env-guards.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isE2EFlagSet } from '../../lib/env-guards.js';

describe('isE2EFlagSet', () => {
  it('returns true for literal "1"', () => {
    expect(isE2EFlagSet('1')).toBe(true);
  });
});
```

- [ ] **Step 1.2: Run test, verify failure**

```bash
cd packages/server && npx vitest run __tests__/lib/env-guards.test.ts
```

Expected: FAIL with `Cannot find module '../../lib/env-guards.js'`.

- [ ] **Step 1.3: Implement `isE2EFlagSet` minimally**

Create `packages/server/src/lib/env-guards.ts`:

```ts
export function isE2EFlagSet(value: string | undefined): boolean {
  return value?.trim() === '1';
}
```

- [ ] **Step 1.4: Run test, verify pass**

Same command. Expected: PASS (1 test).

- [ ] **Step 1.5: Add tests for `isE2EFlagSet` rejection cases**

Append to the `describe('isE2EFlagSet', …)` block:

```ts
  it.each([
    ['undefined', undefined],
    ['empty string', ''],
    ['true', 'true'],
    ['01', '01'],
    ['yes', 'yes'],
    ['"1 " (trailing space — should be accepted after trim)', '1 '],
    ['"\\t1" (leading tab — should be accepted after trim)', '\t1'],
    ['"11"', '11'],
    ['"0"', '0'],
  ])('handles %s correctly', (_label, value) => {
    if (value === '1 ' || value === '\t1') {
      expect(isE2EFlagSet(value)).toBe(true);
    } else {
      expect(isE2EFlagSet(value)).toBe(false);
    }
  });
```

Run: `npx vitest run __tests__/lib/env-guards.test.ts`. Expected: PASS (10 tests total). Confirms strict-equality semantics with whitespace-trim allowance.

- [ ] **Step 1.6: Write failing test for `assertProductionGuards` — passes when NODE_ENV is development**

Append to the test file:

```ts
import { assertProductionGuards } from '../../lib/env-guards.js';

describe('assertProductionGuards', () => {
  it('allows NODE_ENV=development with all flags set', () => {
    expect(() =>
      assertProductionGuards({
        NODE_ENV: 'development',
        ENABLE_TEST_ROUTES: '1',
        LLM_PROVIDER: 'mock',
        E2E_MODE: '1',
      }),
    ).not.toThrow();
  });
});
```

Run: `npx vitest run __tests__/lib/env-guards.test.ts`. Expected: FAIL — `assertProductionGuards is not exported`.

- [ ] **Step 1.7: Implement `assertProductionGuards` minimally**

Append to `packages/server/src/lib/env-guards.ts`:

```ts
type Env = {
  NODE_ENV?: string;
  ENABLE_TEST_ROUTES?: string;
  LLM_PROVIDER?: string;
  E2E_MODE?: string;
};

const DEV_OR_TEST = new Set(['development', 'test']);

export function assertProductionGuards(env: Env): void {
  const nodeEnv = env.NODE_ENV?.trim();
  const isDevOrTest = nodeEnv !== undefined && DEV_OR_TEST.has(nodeEnv);
  if (isDevOrTest) return;

  const offenders: string[] = [];
  if (isE2EFlagSet(env.ENABLE_TEST_ROUTES)) offenders.push('ENABLE_TEST_ROUTES=1');
  if (env.LLM_PROVIDER?.trim() === 'mock') offenders.push('LLM_PROVIDER=mock');
  if (isE2EFlagSet(env.E2E_MODE)) offenders.push('E2E_MODE=1');

  if (offenders.length > 0) {
    throw new Error(
      `Refusing to start: NODE_ENV=${nodeEnv ?? '<unset>'} is not development/test, ` +
        `but the following test-mode flags are set: ${offenders.join(', ')}. ` +
        `This combination is unsafe and would expose destructive endpoints.`,
    );
  }
}
```

Run tests: PASS (11 total).

- [ ] **Step 1.8: Add `assertProductionGuards` rejection tests**

Append cases for production / staging / undefined NODE_ENV with each flag set, allowlist behavior:

```ts
  it.each([
    [{ NODE_ENV: 'production', ENABLE_TEST_ROUTES: '1' }, 'ENABLE_TEST_ROUTES=1'],
    [{ NODE_ENV: 'production', LLM_PROVIDER: 'mock' }, 'LLM_PROVIDER=mock'],
    [{ NODE_ENV: 'production', E2E_MODE: '1' }, 'E2E_MODE=1'],
    [{ NODE_ENV: 'staging', ENABLE_TEST_ROUTES: '1' }, 'ENABLE_TEST_ROUTES=1'],
    [{ ENABLE_TEST_ROUTES: '1' }, 'ENABLE_TEST_ROUTES=1'], // NODE_ENV unset
  ])('rejects %j', (env, expectedOffender) => {
    expect(() => assertProductionGuards(env)).toThrow(expectedOffender);
  });

  it('allows NODE_ENV=test with no flags', () => {
    expect(() => assertProductionGuards({ NODE_ENV: 'test' })).not.toThrow();
  });

  it('allows NODE_ENV=production with no flags set', () => {
    expect(() => assertProductionGuards({ NODE_ENV: 'production' })).not.toThrow();
  });

  it('reports multiple offenders in one error', () => {
    expect(() =>
      assertProductionGuards({
        NODE_ENV: 'production',
        ENABLE_TEST_ROUTES: '1',
        LLM_PROVIDER: 'mock',
      }),
    ).toThrow(/ENABLE_TEST_ROUTES=1, LLM_PROVIDER=mock/);
  });
```

Run tests: PASS (~18 total). All branches of `assertProductionGuards` covered.

- [ ] **Step 1.9: Write failing test for `generateE2ESecret`**

Append to the test file:

```ts
import { generateE2ESecret } from '../../lib/env-guards.js';
import { readFileSync, statSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('generateE2ESecret', () => {
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'forge-secret-'));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('writes a 64-hex-char secret to the given path with mode 0600', () => {
    const path = join(scratch, 'forge-e2e-secret');
    const secret = generateE2ESecret(path);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
    expect(readFileSync(path, 'utf8')).toBe(secret);
    const mode = statSync(path).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it('regenerates unconditionally — second call returns a different secret and overwrites the file', () => {
    const path = join(scratch, 'forge-e2e-secret');
    const first = generateE2ESecret(path);
    const second = generateE2ESecret(path);
    expect(second).not.toBe(first);                // proves NOT cached / NOT no-op
    expect(readFileSync(path, 'utf8')).toBe(second); // file holds the latest value
  });
});
```

Run: FAIL (`generateE2ESecret is not exported`).

- [ ] **Step 1.10: Implement `generateE2ESecret`**

Append to `env-guards.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

export function generateE2ESecret(path: string): string {
  const secret = randomBytes(32).toString('hex');
  writeFileSync(path, secret, { mode: 0o600, flag: 'w' });
  return secret;
}
```

Run tests: PASS.

- [ ] **Step 1.11: Verify 100% coverage of env-guards.ts**

```bash
cd packages/server && npx vitest run --coverage __tests__/lib/env-guards.test.ts
```

Expected: 100% lines / branches / functions / statements for `src/lib/env-guards.ts`.

- [ ] **Step 1.12: Commit**

```bash
git add packages/server/src/lib/env-guards.ts packages/server/src/__tests__/lib/env-guards.test.ts
git commit -m "feat(server): add env-guards lib for E2E test-mode flag handling"
```

---

## Task 2: Mock-scripts registry + shared type

**Files:**
- Create: `packages/server/src/plugins/langchain/mock-scripts.ts`
- Create: `packages/shared/src/types/mock-script-keys.ts`
- Test: `packages/server/src/__tests__/plugins/langchain/mock-scripts.test.ts`
- Modify: `vitest.config.ts` (add the new shared types file to `coverage.exclude`)

- [ ] **Step 2.1: Write failing test for the registry**

Create `packages/server/src/__tests__/plugins/langchain/mock-scripts.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  mockScripts,
  DEFAULT_SCRIPT_KEY,
  resolveMockScript,
} from '../../../plugins/langchain/mock-scripts.js';

describe('mock-scripts registry', () => {
  it('exposes a default script key', () => {
    expect(DEFAULT_SCRIPT_KEY).toBe('default');
    expect(mockScripts[DEFAULT_SCRIPT_KEY]).toBeDefined();
    expect(mockScripts[DEFAULT_SCRIPT_KEY].length).toBeGreaterThan(0);
  });

  it('exposes the named scripts the design references', () => {
    expect(mockScripts['autocomplete-typescript-react']).toBeDefined();
    expect(mockScripts['generate-readme-short']).toBeDefined();
    expect(mockScripts['error-rate-limit']).toBeDefined();
    expect(mockScripts['mid-stream-cancel']).toBeDefined();
  });

  it('every script chunk is a non-empty string', () => {
    for (const [key, chunks] of Object.entries(mockScripts)) {
      expect(chunks.length, `script ${key} must have at least one chunk`).toBeGreaterThan(0);
      for (const c of chunks) {
        expect(typeof c).toBe('string');
        expect(c.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('resolveMockScript', () => {
  const original = { ...process.env };
  let warnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
    process.env = { ...original };
  });

  it('returns the requested script when it exists, no warn', () => {
    process.env.NODE_ENV = 'test';
    expect(resolveMockScript('autocomplete-typescript-react')).toBe(
      mockScripts['autocomplete-typescript-react'],
    );
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('returns the default script when the key is undefined, no warn', () => {
    process.env.NODE_ENV = 'test';
    expect(resolveMockScript(undefined)).toBe(mockScripts[DEFAULT_SCRIPT_KEY]);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('emits console.warn for unknown key when NODE_ENV is not production', () => {
    process.env.NODE_ENV = 'test';
    expect(resolveMockScript('nonexistent-key')).toBe(mockScripts[DEFAULT_SCRIPT_KEY]);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringMatching(/unknown.*X-Mock-Script.*nonexistent-key/i));
  });

  it('does NOT emit console.warn when NODE_ENV=production (silent fallback)', () => {
    process.env.NODE_ENV = 'production';
    expect(resolveMockScript('nonexistent-key')).toBe(mockScripts[DEFAULT_SCRIPT_KEY]);
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
```

Run: FAIL (module not found).

- [ ] **Step 2.2: Implement the registry**

Create `packages/server/src/plugins/langchain/mock-scripts.ts`:

```ts
export const DEFAULT_SCRIPT_KEY = 'default';

export const mockScripts: Record<string, string[]> = {
  default: ['Hello', ' world', '[done]'],
  'autocomplete-typescript-react': [
    'export const Button = ({ ',
    'children, onClick }: Props) => (',
    '\n  <button onClick={onClick}>{children}</button>',
    '\n);',
    '[done]',
  ],
  'generate-readme-short': ['# README\n', '\n', 'TODO: write content.', '[done]'],
  'error-rate-limit': ['[error:rate_limit]'],
  'mid-stream-cancel': ['partial ', 'output '],
};

export function resolveMockScript(key: string | undefined): string[] {
  if (key === undefined) return mockScripts[DEFAULT_SCRIPT_KEY];
  const found = mockScripts[key];
  if (found !== undefined) return found;
  // Unknown key — silent fallback in production (defense-in-depth: mock should
  // never run in prod, but if it does, emit no console output). Warn elsewhere
  // so test authors notice typos.
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.warn(
      `[mock-scripts] unknown X-Mock-Script key "${key}" — falling back to "${DEFAULT_SCRIPT_KEY}"`,
    );
  }
  return mockScripts[DEFAULT_SCRIPT_KEY];
}
```

Run tests: PASS.

- [ ] **Step 2.3: Add the shared type file**

Create `packages/shared/src/types/mock-script-keys.ts` (filename matches issue #44 file scope; directory is `types/` per existing project pattern — see Decision #1 above for rationale):

```ts
/**
 * Type-only export of the names of mock-LLM scripts. Lives in @forge/shared so
 * Playwright fixtures (issue #45) can use it for type-safety on the
 * X-Mock-Script header.
 *
 * Implementation lives at packages/server/src/plugins/langchain/mock-scripts.ts.
 * Keep these in sync.
 */
export type MockScriptKey =
  | 'default'
  | 'autocomplete-typescript-react'
  | 'generate-readme-short'
  | 'error-rate-limit'
  | 'mid-stream-cancel';
```

- [ ] **Step 2.4: Add the new shared type file to vitest.config.ts coverage.exclude**

Edit `vitest.config.ts`. After the line `'packages/shared/src/types/file.ts',` add:

```ts
        'packages/shared/src/types/mock-script-keys.ts',
```

(Maintain alphabetical-ish order matching existing entries.)

- [ ] **Step 2.5: Verify shared package builds**

```bash
npm run build --workspace=packages/shared
```

Expected: clean exit. The new type file is exported via existing barrel re-export pattern? Check `packages/shared/src/types/index.ts` — if it has explicit re-exports, add `export type { MockScriptKey } from './mock-script-keys.js';`. If it uses a glob pattern, no change needed.

- [ ] **Step 2.6: Verify 100% coverage of mock-scripts.ts**

```bash
cd packages/server && npx vitest run --coverage __tests__/plugins/langchain/mock-scripts.test.ts
```

Expected: 100% on `src/plugins/langchain/mock-scripts.ts`.

- [ ] **Step 2.7: Commit**

```bash
git add packages/server/src/plugins/langchain/mock-scripts.ts \
        packages/server/src/__tests__/plugins/langchain/mock-scripts.test.ts \
        packages/shared/src/types/mock-script-keys.ts \
        packages/shared/src/types/index.ts \
        vitest.config.ts
git commit -m "feat(server): add mock-LLM script registry and shared MockScriptKey type"
```

---

## Task 3: Mock LangChain provider (`ChatMock`)

**Files:**
- Create: `packages/server/src/plugins/langchain/mock-provider.ts`
- Test: `packages/server/src/__tests__/plugins/langchain/mock-provider.test.ts`

This is the largest single piece — implements the LangChain `BaseChatModel` streaming contract with `AsyncLocalStorage`-threaded per-request scripting.

- [ ] **Step 3.1: Write failing test — ChatMock streams the resolved script's chunks**

Create `packages/server/src/__tests__/plugins/langchain/mock-provider.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { HumanMessage } from '@langchain/core/messages';
import { ChatMock, mockScriptStorage } from '../../../plugins/langchain/mock-provider.js';
import { mockScripts } from '../../../plugins/langchain/mock-scripts.js';

describe('ChatMock', () => {
  it('streams the chunks of the active mock script via AsyncLocalStorage', async () => {
    const model = new ChatMock({});
    const collected: string[] = [];

    await mockScriptStorage.run('autocomplete-typescript-react', async () => {
      const stream = await model.stream([new HumanMessage('anything')]);
      for await (const chunk of stream) {
        collected.push(typeof chunk.content === 'string' ? chunk.content : '');
      }
    });

    expect(collected).toEqual(mockScripts['autocomplete-typescript-react']);
  });
});
```

Run: FAIL (module not found).

- [ ] **Step 3.2: Implement ChatMock minimally**

Create `packages/server/src/plugins/langchain/mock-provider.ts`. The signature for `_streamResponseChunks` MUST match the LangChain `BaseChatModel` base-class declaration exactly (3 parameters: `messages`, `options`, `runManager?`); narrowing the override breaks the project's TypeScript strict mode `--noImplicitOverride` checks. Verified against `node_modules/@langchain/core/dist/language_models/chat_models.d.ts`:

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import {
  BaseChatModel,
  type BaseChatModelCallOptions,
  type BaseChatModelParams,
} from '@langchain/core/language_models/chat_models';
import type { BaseMessage } from '@langchain/core/messages';
import { AIMessageChunk } from '@langchain/core/messages';
import type { ChatGenerationChunk, ChatResult } from '@langchain/core/outputs';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { resolveMockScript } from './mock-scripts.js';

export const mockScriptStorage = new AsyncLocalStorage<string>();

export class ChatMock extends BaseChatModel<BaseChatModelCallOptions> {
  constructor(fields: BaseChatModelParams = {}) {
    super(fields);
  }

  _llmType(): string {
    return 'mock';
  }

  override async *_streamResponseChunks(
    _messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ): AsyncGenerator<ChatGenerationChunk> {
    const key = mockScriptStorage.getStore();
    const chunks = resolveMockScript(key);
    for (const text of chunks) {
      const message = new AIMessageChunk({ content: text });
      yield { text, message } as ChatGenerationChunk;
    }
  }

  async _generate(): Promise<ChatResult> {
    throw new Error('ChatMock only supports streaming. Use stream() not invoke().');
  }
}
```

Run test: PASS. If TypeScript reports an error on the `override` modifier or the `this['ParsedCallOptions']` reference, run `npm run typecheck --workspace=packages/server` to surface the exact mismatch — the LangChain version installed (`@langchain/core` resolved via npm) is the authority. Adjust the import / generic to whatever that version exports; do NOT remove the `override` modifier.

- [ ] **Step 3.3: Add test for default fallback when no script key in storage**

Append to the test file:

```ts
  it('falls back to the default script when no key is in AsyncLocalStorage', async () => {
    const model = new ChatMock({});
    const collected: string[] = [];
    const stream = await model.stream([new HumanMessage('anything')]);
    for await (const chunk of stream) {
      collected.push(typeof chunk.content === 'string' ? chunk.content : '');
    }
    expect(collected).toEqual(mockScripts['default']);
  });
```

Run: PASS.

- [ ] **Step 3.4: Add test for unknown-key silent fallback**

```ts
  it('falls back to the default script when the key in storage is unknown', async () => {
    const model = new ChatMock({});
    const collected: string[] = [];
    await mockScriptStorage.run('definitely-not-a-real-key', async () => {
      const stream = await model.stream([new HumanMessage('anything')]);
      for await (const chunk of stream) {
        collected.push(typeof chunk.content === 'string' ? chunk.content : '');
      }
    });
    expect(collected).toEqual(mockScripts['default']);
  });
```

Run: PASS.

- [ ] **Step 3.5: Add test for `_llmType` and `_generate`**

```ts
  it('reports llmType "mock"', () => {
    expect(new ChatMock({})._llmType()).toBe('mock');
  });

  it('_generate throws — only streaming is supported', async () => {
    const model = new ChatMock({});
    await expect(model.invoke([new HumanMessage('anything')])).rejects.toThrow(
      /only supports streaming/i,
    );
  });
```

Run: PASS. (LangChain's `invoke()` calls `_generate` internally for non-streaming.)

- [ ] **Step 3.6: Verify 100% coverage of mock-provider.ts**

```bash
cd packages/server && npx vitest run --coverage __tests__/plugins/langchain/mock-provider.test.ts
```

Expected: 100% on `src/plugins/langchain/mock-provider.ts`. If branch coverage shows < 100%, the typeof-guard for `chunk.content` in the test loop may have an uncovered `else` — that's test-side code, not source. Source should be fully covered.

- [ ] **Step 3.7: Commit**

```bash
git add packages/server/src/plugins/langchain/mock-provider.ts \
        packages/server/src/__tests__/plugins/langchain/mock-provider.test.ts
git commit -m "feat(server): add mock LangChain ChatMock provider with AsyncLocalStorage scripting"
```

---

## Task 4: Wire `mock` case into `createChatModel()` switch

**Files:**
- Modify: `packages/server/src/plugins/langchain/provider.ts`
- Test: `packages/server/src/__tests__/plugins/langchain/provider.test.ts`

- [ ] **Step 4.1: Read existing provider test file**

```bash
cat packages/server/src/__tests__/plugins/langchain/provider.test.ts
```

Note its existing imports + `describe` blocks; new tests append to the file in the same style.

- [ ] **Step 4.2: Add failing test — mock provider returned when LLM_PROVIDER=mock**

Append to `provider.test.ts`:

```ts
describe('createChatModel mock case', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('returns a ChatMock when LLM_PROVIDER=mock and NODE_ENV=test', async () => {
    process.env.LLM_PROVIDER = 'mock';
    process.env.NODE_ENV = 'test';
    const { createChatModel } = await import('../../../plugins/langchain/provider.js');
    const { ChatMock } = await import('../../../plugins/langchain/mock-provider.js');
    const model = createChatModel();
    expect(model).toBeInstanceOf(ChatMock);
  });

  it('throws when LLM_PROVIDER=mock and NODE_ENV=production', async () => {
    process.env.LLM_PROVIDER = 'mock';
    process.env.NODE_ENV = 'production';
    const { createChatModel } = await import('../../../plugins/langchain/provider.js');
    expect(() => createChatModel()).toThrow(/mock.*production/i);
  });
});
```

Run: FAIL (no `'mock'` case yet, falls to `default: throw`).

- [ ] **Step 4.3: Add the mock case to provider.ts**

Edit `packages/server/src/plugins/langchain/provider.ts`. The current shape:

```ts
import { ChatOllama } from '@langchain/community/chat_models/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { ChatVertexAI } from '@langchain/google-vertexai';
```

Add at top with other imports:

```ts
import { ChatMock } from './mock-provider.js';
```

And in the switch, before `default:`:

```ts
    case 'mock':
      if (process.env.NODE_ENV?.trim() === 'production') {
        throw new Error(
          'LLM_PROVIDER=mock refused: NODE_ENV=production. Mock provider must never run in production.',
        );
      }
      return new ChatMock({}) as unknown as BaseChatModel;
```

Run tests: PASS.

- [ ] **Step 4.4: Verify 100% coverage on provider.ts**

```bash
cd packages/server && npx vitest run --coverage __tests__/plugins/langchain/provider.test.ts
```

Expected: 100% on `src/plugins/langchain/provider.ts`. The new branch (mock+production-throw) is covered.

- [ ] **Step 4.5: Commit**

```bash
git add packages/server/src/plugins/langchain/provider.ts \
        packages/server/src/__tests__/plugins/langchain/provider.test.ts
git commit -m "feat(server): add mock case to LLM provider switch with production guard"
```

---

## Task 5: `mockScriptHeaderHook` in LangChain plugin

**Files:**
- Modify: `packages/server/src/plugins/langchain/index.ts`
- Test: `packages/server/src/__tests__/plugins/langchain/plugin.test.ts`

The hook reads `X-Mock-Script` from each request and runs the rest of the request handler inside `mockScriptStorage.run(value, …)`. Only registered when `LLM_PROVIDER=mock`.

- [ ] **Step 5.1: Read existing plugin test**

```bash
cat packages/server/src/__tests__/plugins/langchain/plugin.test.ts
```

Note the existing setup pattern (Fastify `inject`).

- [ ] **Step 5.2: Write failing test — hook is registered when LLM_PROVIDER=mock**

Append to `plugin.test.ts`:

```ts
import { mockScriptStorage } from '../../../plugins/langchain/mock-provider.js';

describe('mockScriptHeaderHook', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('threads X-Mock-Script through AsyncLocalStorage when LLM_PROVIDER=mock', async () => {
    process.env.LLM_PROVIDER = 'mock';
    process.env.NODE_ENV = 'test';
    const { buildApp } = await import('../../../app.js');
    const app = await buildApp();
    await app.ready();

    let observedKey: string | undefined;
    app.get('/__test_observe', async (request) => {
      observedKey = mockScriptStorage.getStore();
      return { ok: true };
    });

    await app.inject({
      method: 'GET',
      url: '/__test_observe',
      headers: { 'X-Mock-Script': 'autocomplete-typescript-react' },
    });

    expect(observedKey).toBe('autocomplete-typescript-react');
    await app.close();
  });

  it('does NOT thread when LLM_PROVIDER is not mock (no-op branch)', async () => {
    process.env.LLM_PROVIDER = 'openai';
    process.env.NODE_ENV = 'test';
    const { buildApp } = await import('../../../app.js');
    const app = await buildApp();
    await app.ready();

    let observedKey: string | undefined = 'sentinel';
    app.get('/__test_observe', async () => {
      observedKey = mockScriptStorage.getStore();
      return { ok: true };
    });

    await app.inject({
      method: 'GET',
      url: '/__test_observe',
      headers: { 'X-Mock-Script': 'autocomplete-typescript-react' },
    });

    expect(observedKey).toBeUndefined();
    await app.close();
  });
});
```

Run: FAIL (hook doesn't exist yet).

- [ ] **Step 5.3: Implement the hook in index.ts**

Edit `packages/server/src/plugins/langchain/index.ts`. Add import at top:

```ts
import { mockScriptStorage } from './mock-provider.js';
```

Inside `langchainPluginImpl`, after the existing `app.decorate(...)` calls and BEFORE the existing `app.addHook('onResponse', ...)`, add:

```ts
  if (process.env.LLM_PROVIDER?.trim() === 'mock') {
    app.addHook('onRequest', async (request) => {
      const key = request.headers['x-mock-script'];
      if (typeof key === 'string') {
        mockScriptStorage.enterWith(key);
      }
    });
  }
```

(`enterWith` is the AsyncLocalStorage method that sets the store for the current async context — equivalent to `run` but without wrapping a function. Fastify hooks work with `enterWith` because the request handler runs in the same async context the hook initializes.)

Run tests: PASS for both branches.

- [ ] **Step 5.4: Verify 100% coverage on index.ts (langchain plugin)**

```bash
cd packages/server && npx vitest run --coverage __tests__/plugins/langchain/plugin.test.ts
```

Expected: 100% on `src/plugins/langchain/index.ts`.

- [ ] **Step 5.5: Commit**

```bash
git add packages/server/src/plugins/langchain/index.ts \
        packages/server/src/__tests__/plugins/langchain/plugin.test.ts
git commit -m "feat(server): thread X-Mock-Script through AsyncLocalStorage when LLM_PROVIDER=mock"
```

---

## Task 6: `__test__` route — gating + reset handler

**Files:**
- Create: `packages/server/src/routes/__test__.ts`
- Test: `packages/server/src/__tests__/routes/__test__.test.ts`

This is the destructive endpoint with six gating layers. We TDD the gates first, then the handler.

- [ ] **Step 6.1: Write failing test — registerTestRoutes returns silently when ENABLE_TEST_ROUTES is unset**

Create `packages/server/src/__tests__/routes/__test__.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerTestRoutes, E2E_RESET_LOCK_ID } from '../../routes/__test__.js';

describe('registerTestRoutes — gating', () => {
  it('exports E2E_RESET_LOCK_ID as a 64-bit BigInt constant', () => {
    expect(typeof E2E_RESET_LOCK_ID).toBe('bigint');
    expect(E2E_RESET_LOCK_ID).toBe(0xe2e5e70n);
  });

  it('does NOT register when ENABLE_TEST_ROUTES is unset', async () => {
    const app = Fastify();
    await registerTestRoutes(app, {
      env: {},
      secret: 'unused',
      isCI: false,
      host: '127.0.0.1',
      pgQuery: async () => undefined,
    });
    const res = await app.inject({ method: 'POST', url: '/api/__test__/reset' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('does NOT register when NODE_ENV=production', async () => {
    const app = Fastify();
    await registerTestRoutes(app, {
      env: { ENABLE_TEST_ROUTES: '1', NODE_ENV: 'production' },
      secret: 'abc',
      isCI: false,
      host: '127.0.0.1',
      pgQuery: async () => undefined,
    });
    const res = await app.inject({ method: 'POST', url: '/api/__test__/reset' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('does NOT register when host is non-loopback and not in CI', async () => {
    const app = Fastify();
    await registerTestRoutes(app, {
      env: { ENABLE_TEST_ROUTES: '1', NODE_ENV: 'test' },
      secret: 'abc',
      isCI: false,
      host: '0.0.0.0',
      pgQuery: async () => undefined,
    });
    const res = await app.inject({ method: 'POST', url: '/api/__test__/reset' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
```

Run: FAIL (module not found).

- [ ] **Step 6.2: Implement registerTestRoutes scaffolding (gates only, no handler)**

Create `packages/server/src/routes/__test__.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { isE2EFlagSet } from '../lib/env-guards.js';

export const E2E_RESET_LOCK_ID = 0xe2e5e70n;

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const DEV_OR_TEST = new Set(['development', 'test']);

export type TestRoutesDeps = {
  env: { ENABLE_TEST_ROUTES?: string; NODE_ENV?: string };
  secret: string;
  isCI: boolean;
  host: string;
  pgQuery: (sql: string) => Promise<unknown>;
};

export async function registerTestRoutes(
  app: FastifyInstance,
  deps: TestRoutesDeps,
): Promise<void> {
  if (!isE2EFlagSet(deps.env.ENABLE_TEST_ROUTES)) return;
  const nodeEnv = deps.env.NODE_ENV?.trim();
  if (!nodeEnv || !DEV_OR_TEST.has(nodeEnv)) return;
  if (!LOOPBACK_HOSTS.has(deps.host) && !deps.isCI) return;

  app.log.info('mounting __test__ routes (E2E mode)');

  // Handler comes in a later step.
}
```

Run: 3 gating tests PASS. The exported constant test also passes.

- [ ] **Step 6.3: Add failing test — missing X-E2E-Secret returns 403**

Append:

```ts
describe('POST /api/__test__/reset — auth', () => {
  let pgCalls: string[];

  beforeEach(() => {
    pgCalls = [];
  });

  async function makeApp() {
    const app = Fastify();
    await registerTestRoutes(app, {
      env: { ENABLE_TEST_ROUTES: '1', NODE_ENV: 'test' },
      secret: 'expected-secret-abc',
      isCI: false,
      host: '127.0.0.1',
      pgQuery: async (sql) => {
        pgCalls.push(sql);
      },
    });
    return app;
  }

  it('returns 403 when X-E2E-Secret header is missing', async () => {
    const app = await makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/__test__/reset' });
    expect(res.statusCode).toBe(403);
    expect(pgCalls).toEqual([]);
    await app.close();
  });

  it('returns 403 when X-E2E-Secret header is wrong', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'wrong' },
    });
    expect(res.statusCode).toBe(403);
    expect(pgCalls).toEqual([]);
    await app.close();
  });

  it('returns 403 when an Origin header is present (browser CSRF defense)', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'expected-secret-abc', Origin: 'http://evil.example' },
    });
    expect(res.statusCode).toBe(403);
    expect(pgCalls).toEqual([]);
    await app.close();
  });
});
```

Run: FAIL (handler not implemented).

- [ ] **Step 6.4: Implement the handler with secret check + Origin rejection**

In `__test__.ts`, replace the `// Handler comes in a later step.` comment with:

```ts
import { timingSafeEqual } from 'node:crypto';
import { readFileSync } from 'node:fs';

  app.post('/api/__test__/reset', async (request, reply) => {
    if (request.headers.origin !== undefined) {
      return reply.code(403).send({ error: 'Origin header not allowed on test routes' });
    }
    const provided = request.headers['x-e2e-secret'];
    if (typeof provided !== 'string' || !secretsEqual(provided, deps.secret)) {
      return reply.code(403).send({ error: 'invalid X-E2E-Secret' });
    }

    let seedSql: string;
    try {
      seedSql = readFileSync('scripts/seed.sql', 'utf8');
    } catch (err) {
      app.log.error({ err }, 'failed to read scripts/seed.sql');
      return reply.code(500).send({ error: 'failed to read seed file' });
    }

    await deps.pgQuery(`SELECT pg_advisory_lock(${E2E_RESET_LOCK_ID.toString()})`);
    try {
      await deps.pgQuery(seedSql);
    } finally {
      await deps.pgQuery(`SELECT pg_advisory_unlock(${E2E_RESET_LOCK_ID.toString()})`);
    }

    app.log.info(
      { workerId: process.env.TEST_WORKER_INDEX ?? 'unknown', ts: Date.now() },
      'E2E reset completed',
    );
    return reply.code(204).send();
  });
}

function secretsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
```

Note: imports go at the top of the file. Move `import { timingSafeEqual }` and `import { readFileSync }` to the top.

Run tests: 3 auth tests PASS. (The existing 3 gating tests still pass.)

- [ ] **Step 6.5: Add success test — correct secret triggers seed.sql execution AND emits audit log**

Append:

```ts
  it('returns 204, runs seed.sql with advisory lock, and emits audit log when secret matches', async () => {
    const app = await makeApp();
    const logSpy = vi.spyOn(app.log, 'info');

    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'expected-secret-abc' },
    });

    expect(res.statusCode).toBe(204);
    // Expected SQL trace: lock, seed, unlock.
    expect(pgCalls.length).toBe(3);
    expect(pgCalls[0]).toMatch(/pg_advisory_lock/);
    expect(pgCalls[1]).toMatch(/^BEGIN;/);
    expect(pgCalls[1]).toMatch(/COMMIT;\s*$/);
    expect(pgCalls[2]).toMatch(/pg_advisory_unlock/);

    // Audit log requirement (issue #44 adversarial-review checklist):
    // every successful reset MUST log workerId + timestamp.
    const auditCall = logSpy.mock.calls.find((args) => /reset completed/i.test(String(args[1] ?? '')));
    expect(auditCall, 'expected an "E2E reset completed" log line').toBeDefined();
    const auditPayload = auditCall![0] as { workerId: unknown; ts: unknown };
    expect(auditPayload).toHaveProperty('workerId');
    expect(auditPayload).toHaveProperty('ts');
    expect(typeof auditPayload.ts).toBe('number');

    await app.close();
  });
```

Make sure `vi` is imported at the top of the test file (`import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';`).

Run: PASS.

- [ ] **Step 6.6: Add failure test — pgQuery error releases the advisory lock**

Append:

```ts
  it('releases the advisory lock even when seed execution throws', async () => {
    const app = Fastify();
    const calls: string[] = [];
    await registerTestRoutes(app, {
      env: { ENABLE_TEST_ROUTES: '1', NODE_ENV: 'test' },
      secret: 'expected-secret-abc',
      isCI: false,
      host: '127.0.0.1',
      pgQuery: async (sql) => {
        calls.push(sql);
        if (/^BEGIN/.test(sql)) throw new Error('simulated DB failure');
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/__test__/reset',
      headers: { 'X-E2E-Secret': 'expected-secret-abc' },
    });
    expect(res.statusCode).toBe(500);
    // Lock acquired, seed failed, but unlock was still called.
    expect(calls.some((s) => /pg_advisory_unlock/.test(s))).toBe(true);
    await app.close();
  });
```

Run: FAIL — the current handler has no try/catch around the lock release on a thrown query. Wait — yes it does, the `try/finally`. But Fastify will see the unhandled rejection and return 500 by default. Verify.

If the test reports `pg_advisory_unlock` is missing from `calls`, the issue is the handler's `finally` calls `pgQuery` again for unlock, which the test mock is recording. But the `BEGIN;` throws before unlock — the finally should still run. The test should pass.

If the test reports `statusCode 500` mismatch (e.g., 200 instead), Fastify caught the throw and returned a generic error — that's fine, just adjust the test to `expect(res.statusCode).toBeGreaterThanOrEqual(500)`.

- [ ] **Step 6.7: Verify 100% coverage on __test__.ts**

```bash
cd packages/server && npx vitest run --coverage __tests__/routes/__test__.test.ts
```

Expected: 100% lines / branches / functions / statements on `src/routes/__test__.ts`. If branch coverage shows < 100%, look for the `if (typeof provided !== 'string' || !secretsEqual(...))` short-circuit — both halves need a test (header missing AND header wrong), which we have.

- [ ] **Step 6.8: Commit**

```bash
git add packages/server/src/routes/__test__.ts \
        packages/server/src/__tests__/routes/__test__.test.ts
git commit -m "feat(server): add gated __test__/reset endpoint with six-layer defense"
```

---

## Task 7: Wire test routes through `app.ts`

**Files:**
- Modify: `packages/server/src/app.ts`
- Modify: `packages/server/src/__tests__/app.test.ts`

- [ ] **Step 7.1: Read existing app.test.ts**

```bash
cat packages/server/src/__tests__/app.test.ts
```

Note its structure.

- [ ] **Step 7.2: Write failing test — test routes registered when ENABLE_TEST_ROUTES=1**

Append to `app.test.ts`:

```ts
describe('app — test routes', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('registers __test__ routes when ENABLE_TEST_ROUTES=1 and NODE_ENV=test', async () => {
    process.env.ENABLE_TEST_ROUTES = '1';
    process.env.NODE_ENV = 'test';
    process.env.HOST = '127.0.0.1';
    process.env.E2E_SECRET = 'app-test-secret';
    const { buildApp } = await import('../app.js');
    const app = await buildApp();
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/api/__test__/reset' });
    // 403 (no secret) is expected — proves the route IS registered.
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('does NOT register __test__ routes when ENABLE_TEST_ROUTES is unset', async () => {
    delete process.env.ENABLE_TEST_ROUTES;
    process.env.NODE_ENV = 'test';
    const { buildApp } = await import('../app.js');
    const app = await buildApp();
    await app.ready();
    const res = await app.inject({ method: 'POST', url: '/api/__test__/reset' });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});
```

Run: FAIL (registerTestRoutes not yet wired).

- [ ] **Step 7.3: Wire registerTestRoutes into buildApp**

Edit `packages/server/src/app.ts`. Add imports near other route imports:

```ts
import { registerTestRoutes } from './routes/__test__.js';
import { isE2EFlagSet } from './lib/env-guards.js';
import pgPlugin from '@fastify/postgres';  // Only if not already imported. If pg is used differently in the codebase, adapt.
```

Look at how the existing routes use the database. There's likely an existing pg plugin or query helper. If `app.pg` is the standard, use it. If queries go through a `db/queries/*` helper, write a minimal pg-query function inline.

Inside `buildApp`, after the existing `app.register(...)` calls and before the `onReady` hook, add:

```ts
  if (isE2EFlagSet(process.env.ENABLE_TEST_ROUTES)) {
    const { Client } = await import('pg');
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
    app.addHook('onClose', async () => client.end());
    await registerTestRoutes(app, {
      env: {
        ENABLE_TEST_ROUTES: process.env.ENABLE_TEST_ROUTES,
        NODE_ENV: process.env.NODE_ENV,
      },
      secret: process.env.E2E_SECRET ?? '',
      isCI: process.env.CI === 'true',
      host: process.env.HOST ?? '0.0.0.0',
      pgQuery: async (sql) => {
        await client.query(sql);
      },
    });
  }
```

Run tests: PASS for both branches.

- [ ] **Step 7.4: Verify 100% coverage on app.ts**

```bash
cd packages/server && npx vitest run --coverage __tests__/app.test.ts
```

Expected: 100% on `src/app.ts`. If a new branch (the `if (isE2EFlagSet(...))`) is uncovered, the second test (when flag is unset) covers it.

- [ ] **Step 7.5: Commit**

```bash
git add packages/server/src/app.ts packages/server/src/__tests__/app.test.ts
git commit -m "feat(server): conditionally mount __test__ routes when ENABLE_TEST_ROUTES=1"
```

---

## Task 8: Boot fail-fast — extract testable wrapper, then call it from `server.ts`

**Files:**
- Create: `packages/server/src/lib/bootstrap.ts`
- Test: `packages/server/src/__tests__/lib/bootstrap.test.ts`
- Modify: `packages/server/src/server.ts`

`server.ts` itself is already in `vitest.config.ts` `coverage.exclude`. To satisfy the issue's adversarial-review checklist requirement that "each layer has its own failing test that proves it gates", the boot logic is extracted into `lib/bootstrap.ts` (a coverable file) and `server.ts` becomes a thin shim that calls it. The wrapper accepts injectable `onError` and `onExit` hooks so tests can drive the failure path without actually exiting the test process.

- [ ] **Step 8.1: Write failing test for `runBootGuards` — happy path**

Create `packages/server/src/__tests__/lib/bootstrap.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBootGuards } from '../../lib/bootstrap.js';

describe('runBootGuards', () => {
  let scratch: string;

  beforeEach(() => {
    scratch = mkdtempSync(join(tmpdir(), 'forge-bootstrap-'));
  });

  afterEach(() => {
    rmSync(scratch, { recursive: true, force: true });
  });

  it('returns normally when env is dev/test with no flags', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' };
    const onError = vi.fn();
    const onExit = vi.fn();
    runBootGuards(env, { onError, onExit, runnerTemp: scratch });
    expect(onError).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
  });

  it('writes a fresh E2E_SECRET to RUNNER_TEMP/forge-e2e-secret when ENABLE_TEST_ROUTES=1', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', ENABLE_TEST_ROUTES: '1' };
    runBootGuards(env, { onError: vi.fn(), onExit: vi.fn(), runnerTemp: scratch });
    expect(env.E2E_SECRET).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(join(scratch, 'forge-e2e-secret'))).toBe(true);
  });

  it('does NOT generate an E2E secret when ENABLE_TEST_ROUTES is unset', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test' };
    runBootGuards(env, { onError: vi.fn(), onExit: vi.fn(), runnerTemp: scratch });
    expect(env.E2E_SECRET).toBeUndefined();
    expect(existsSync(join(scratch, 'forge-e2e-secret'))).toBe(false);
  });

  it('calls onError + onExit(1) when production is paired with a test-mode flag', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', ENABLE_TEST_ROUTES: '1' };
    const onError = vi.fn();
    const onExit = vi.fn();
    runBootGuards(env, { onError, onExit, runnerTemp: scratch });
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/refusing to start/i));
    expect(onExit).toHaveBeenCalledWith(1);
  });

  it('calls onError + onExit(1) when LLM_PROVIDER=mock in production', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'production', LLM_PROVIDER: 'mock' };
    const onError = vi.fn();
    const onExit = vi.fn();
    runBootGuards(env, { onError, onExit, runnerTemp: scratch });
    expect(onError).toHaveBeenCalledWith(expect.stringMatching(/llm_provider=mock/i));
    expect(onExit).toHaveBeenCalledWith(1);
  });

  it('falls back to os.tmpdir() when runnerTemp is not provided', () => {
    const env: NodeJS.ProcessEnv = { NODE_ENV: 'test', ENABLE_TEST_ROUTES: '1' };
    runBootGuards(env, { onError: vi.fn(), onExit: vi.fn() });
    expect(env.E2E_SECRET).toMatch(/^[0-9a-f]{64}$/);
    // Cleanup: remove the file we wrote to the real tmpdir.
    rmSync(join(tmpdir(), 'forge-e2e-secret'), { force: true });
  });
});
```

Run: FAIL (module not found).

- [ ] **Step 8.2: Implement `runBootGuards`**

Create `packages/server/src/lib/bootstrap.ts`:

```ts
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertProductionGuards, generateE2ESecret, isE2EFlagSet } from './env-guards.js';

export type BootHooks = {
  onError?: (msg: string) => void;
  onExit?: (code: number) => void;
  runnerTemp?: string;
};

export function runBootGuards(env: NodeJS.ProcessEnv, hooks: BootHooks = {}): void {
  const onError = hooks.onError ?? ((m: string) => console.error(m));
  const onExit = hooks.onExit ?? ((c: number) => process.exit(c));

  try {
    assertProductionGuards(env);
  } catch (err) {
    onError(err instanceof Error ? err.message : String(err));
    onExit(1);
    return; // tests inject a no-op onExit; guard against continuing past
  }

  if (isE2EFlagSet(env.ENABLE_TEST_ROUTES)) {
    const dir = hooks.runnerTemp ?? env.RUNNER_TEMP ?? tmpdir();
    const path = join(dir, 'forge-e2e-secret');
    env.E2E_SECRET = generateE2ESecret(path);
  }
}
```

Run tests: PASS (6 tests).

- [ ] **Step 8.3: Verify 100% coverage on bootstrap.ts**

```bash
cd packages/server && npx vitest run --coverage __tests__/lib/bootstrap.test.ts
```

Expected: 100% on `src/lib/bootstrap.ts`.

- [ ] **Step 8.4: Update server.ts to call the wrapper**

Replace the contents of `packages/server/src/server.ts` with:

```ts
import { runBootGuards } from './lib/bootstrap.js';
import { buildApp } from './app.js';

runBootGuards(process.env);

const PORT = parseInt(process.env.PORT ?? '3001', 10);
const HOST = process.env.HOST ?? '0.0.0.0';

async function start() {
  const app = await buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
```

`server.ts` remains in `vitest.config.ts` `coverage.exclude` (no change to that exclude list). The boot logic that we wanted covered now lives in `bootstrap.ts` and is fully tested.

- [ ] **Step 8.5: Smoke-test server boot manually**

```bash
cd /Users/andrew/Code/forge
NODE_ENV=test ENABLE_TEST_ROUTES=1 LLM_PROVIDER=mock E2E_MODE=1 \
  set -a && source .env && set +a && \
  cd packages/server && npx tsx src/server.ts &
SERVER_PID=$!
sleep 3
curl -s http://localhost:3001/api/health
echo
# Confirm the secret file was written:
ls -l "${RUNNER_TEMP:-/tmp}/forge-e2e-secret"
kill $SERVER_PID
```

Expected: `{"status":"ok"}` from health, and secret file exists with `-rw-------` permissions.

- [ ] **Step 8.6: Smoke-test boot fail-fast**

```bash
NODE_ENV=production ENABLE_TEST_ROUTES=1 \
  cd packages/server && npx tsx src/server.ts
echo "exit code: $?"
```

Expected: stderr contains "Refusing to start", exit code 1.

- [ ] **Step 8.7: Commit**

```bash
git add packages/server/src/lib/bootstrap.ts \
        packages/server/src/__tests__/lib/bootstrap.test.ts \
        packages/server/src/server.ts
git commit -m "feat(server): boot fail-fast on production+test-mode flag combinations"
```

---

## Task 9: Seed-script production guard

**Files:**
- Create: `scripts/seed-guard.ts`
- Test: `packages/server/src/__tests__/scripts/seed-guard.test.ts`
- Modify: `packages/server/package.json` (seed script)

- [ ] **Step 9.1: Write failing test for `parseSeedTarget`**

Create `packages/server/src/__tests__/scripts/seed-guard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseSeedTarget } from '../../../../scripts/seed-guard.js';

describe('parseSeedTarget', () => {
  it.each([
    ['postgresql://forge:pw@localhost:5432/forge', 'localhost'],
    ['postgresql://forge:pw@127.0.0.1:5432/forge', '127.0.0.1'],
    // Node's URL.hostname returns IPv6 hosts WITH the brackets (e.g. "[::1]").
    // parseSeedTarget MUST strip the brackets so SAFE_HOSTS lookups work
    // against the canonical host string.
    ['postgresql://forge:pw@[::1]:5432/forge', '::1'],
    ['postgresql://forge:pw@host.docker.internal:5432/forge', 'host.docker.internal'],
    ['postgresql://forge:pw@db.example.com:5432/forge', 'db.example.com'],
  ])('extracts host from %s', (url, expected) => {
    expect(parseSeedTarget(url)).toBe(expected);
  });

  it('strips IPv6 brackets', () => {
    // Defensive duplicate to make the bracket-stripping behavior explicit;
    // any future change that breaks it should fail here loudly.
    expect(parseSeedTarget('postgresql://forge:pw@[::1]:5432/forge')).toBe('::1');
  });

  it('throws on missing url', () => {
    expect(() => parseSeedTarget(undefined)).toThrow(/DATABASE_URL/);
  });

  it('throws on malformed url', () => {
    expect(() => parseSeedTarget('not a url')).toThrow(/Invalid DATABASE_URL/);
  });
});
```

Run: FAIL (module not found).

- [ ] **Step 9.2: Write failing test for `assertSeedAllowed`**

Append:

```ts
import { assertSeedAllowed } from '../../../../scripts/seed-guard.js';

describe('assertSeedAllowed', () => {
  const SAFE_HOSTS = ['localhost', '127.0.0.1', '::1', 'host.docker.internal'];

  it.each(SAFE_HOSTS)('allows safe host %s without override', (host) => {
    expect(() => assertSeedAllowed(host, undefined)).not.toThrow();
  });

  it('rejects unsafe host without override', () => {
    expect(() => assertSeedAllowed('db.example.com', undefined)).toThrow(/refusing/i);
  });

  it('allows unsafe host when ALLOW_DESTRUCTIVE_SEED=1', () => {
    expect(() => assertSeedAllowed('db.example.com', '1')).not.toThrow();
  });

  it('rejects unsafe host when ALLOW_DESTRUCTIVE_SEED is set to a non-1 value', () => {
    expect(() => assertSeedAllowed('db.example.com', 'true')).toThrow(/refusing/i);
  });
});
```

Run: FAIL.

- [ ] **Step 9.3: Implement seed-guard.ts**

Create `scripts/seed-guard.ts`:

```ts
#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const SAFE_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal']);

export function parseSeedTarget(url: string | undefined): string {
  if (!url) {
    throw new Error('DATABASE_URL is not set. Refusing to seed.');
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Invalid DATABASE_URL: cannot parse "${url}"`);
  }
  // Node's URL.hostname returns IPv6 hosts WITH brackets (e.g. "[::1]").
  // Strip them so the canonical comparison against SAFE_HOSTS works.
  const host = parsed.hostname;
  if (host.startsWith('[') && host.endsWith(']')) {
    return host.slice(1, -1);
  }
  return host;
}

export function assertSeedAllowed(host: string, override: string | undefined): void {
  if (SAFE_HOSTS.has(host)) return;
  if (override?.trim() === '1') return;
  throw new Error(
    `Refusing to seed: DATABASE_URL host "${host}" is not localhost. ` +
      `Set ALLOW_DESTRUCTIVE_SEED=1 to override (e.g., for explicit ops use).`,
  );
}

if (import.meta.url === `file://${process.argv[1]}` || process.env.SEED_GUARD_RUN === '1') {
  try {
    const host = parseSeedTarget(process.env.DATABASE_URL);
    assertSeedAllowed(host, process.env.ALLOW_DESTRUCTIVE_SEED);
    const seedPath = resolve(process.cwd(), 'scripts/seed.sql');
    execFileSync('psql', [process.env.DATABASE_URL!, '-f', seedPath], {
      stdio: 'inherit',
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
```

Run tests: all PASS. (The exec-on-import check at the bottom is environment-conditional and is excluded from coverage by virtue of the file living outside `packages/*/src/**`. The unit tests cover `parseSeedTarget` and `assertSeedAllowed` exhaustively.)

- [ ] **Step 9.4: Verify coverage of the testable functions**

```bash
cd packages/server && npx vitest run --coverage __tests__/scripts/seed-guard.test.ts
```

The file is not under `packages/*/src/**`, so it won't appear in the coverage report — but the tests still verify behavior.

- [ ] **Step 9.5: Update server package.json seed script**

Edit `packages/server/package.json`. Replace the `seed` script:

```json
    "seed": "SEED_GUARD_RUN=1 tsx ../../scripts/seed-guard.ts"
```

- [ ] **Step 9.6: Manual smoke-test the guard**

```bash
# Should succeed (assuming localhost in .env):
cd packages/server && set -a && source ../../.env && set +a && npm run seed

# Should refuse:
DATABASE_URL=postgresql://x:x@db.example.com:5432/forge \
  cd packages/server && SEED_GUARD_RUN=1 npx tsx ../../scripts/seed-guard.ts
echo "exit code: $?"
```

Expected: first command runs psql normally; second prints "Refusing to seed" and exits 1.

- [ ] **Step 9.7: Commit**

```bash
git add scripts/seed-guard.ts \
        packages/server/src/__tests__/scripts/seed-guard.test.ts \
        packages/server/package.json
git commit -m "feat(server): add seed-script production guard refusing non-localhost DBs"
```

---

## Task 10: `seed.sql` shape regression test

**Files:**
- Test: `packages/server/src/__tests__/scripts/seed-sql-shape.test.ts`

A guard that catches future psql meta-commands (`\copy`, `\set`, `\i`) being added to `seed.sql` — those would silently break the reset endpoint.

- [ ] **Step 10.1: Write the test**

Create `packages/server/src/__tests__/scripts/seed-sql-shape.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('scripts/seed.sql shape', () => {
  const seedPath = resolve(__dirname, '..', '..', '..', '..', '..', 'scripts', 'seed.sql');
  const seedContent = readFileSync(seedPath, 'utf8');

  it('contains no psql meta-commands (lines starting with backslash)', () => {
    const offenders = seedContent
      .split('\n')
      .map((line, idx) => ({ line, idx: idx + 1 }))
      .filter(({ line }) => /^\s*\\/.test(line));
    if (offenders.length > 0) {
      const messages = offenders.map((o) => `  line ${o.idx}: ${o.line.trim()}`).join('\n');
      throw new Error(
        `seed.sql must contain only standard SQL — psql meta-commands break the ` +
          `__test__/reset endpoint, which executes seed.sql via the pg driver.\n${messages}`,
      );
    }
    expect(offenders).toEqual([]);
  });

  it('opens with BEGIN and closes with COMMIT', () => {
    expect(seedContent.trimStart()).toMatch(/^BEGIN;/);
    expect(seedContent.trimEnd()).toMatch(/COMMIT;$/);
  });
});
```

- [ ] **Step 10.2: Run the test**

```bash
cd packages/server && npx vitest run __tests__/scripts/seed-sql-shape.test.ts
```

Expected: PASS (today's `seed.sql` is clean — verified during plan-write).

- [ ] **Step 10.3: Commit**

```bash
git add packages/server/src/__tests__/scripts/seed-sql-shape.test.ts
git commit -m "test(server): assert seed.sql contains no psql meta-commands"
```

---

## Task 11: Vitest test-discovery exclusion for `e2e/`

**Files:**
- Modify: `vitest.config.ts`

The architect's round-2 follow-up: Vitest test discovery (separate from coverage scope) defaults to scanning the repo root for `*.spec.ts` / `*.test.ts`. `e2e/specs/**/*.spec.ts` are Playwright specs, not Vitest tests. They must be excluded explicitly.

- [ ] **Step 11.1: Edit `vitest.config.ts`**

Add a `test.exclude` array. After the `test:` opening brace and before the `coverage:` block:

```ts
  test: {
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    coverage: {
      // ... existing config
```

The defaults Vitest uses already include `node_modules` and `dist`; we restate them so the new `e2e/**` pattern is added without losing the defaults.

- [ ] **Step 11.2: Verify Vitest skips e2e/**

```bash
mkdir -p e2e/specs
cat > e2e/specs/sample.spec.ts <<'EOF'
import { describe, it } from 'vitest';
describe('canary', () => { it('should not run', () => { throw new Error('VITEST PICKED UP E2E'); }); });
EOF

npm run test
```

Expected: vitest does NOT discover the canary file. Suite passes.

```bash
rm e2e/specs/sample.spec.ts
rmdir e2e/specs e2e 2>/dev/null
```

- [ ] **Step 11.3: Commit**

```bash
git add vitest.config.ts
git commit -m "build: exclude e2e/** from Vitest test discovery"
```

---

## Task 12: Bruno CI fix

**Files:**
- Modify: `.github/workflows/bruno-regression.yml`
- Modify: `bruno/ai/complete.bru`
- Modify: `bruno/README.md`

The mock provider replaces the OpenAI dependency in CI. `ai/complete.bru`'s assertion changes from "real LLM streamed tokens" to "deterministic mock SSE shape".

- [ ] **Step 12.1: Read current workflow file**

```bash
cat .github/workflows/bruno-regression.yml
```

Find the top-level `env:` block (or the job-level env block).

- [ ] **Step 12.2: Add the four env vars**

The current workflow (verified at plan-write time) has its env at JOB level — under `jobs.bruno-regression.env:`, not at the workflow top level. Add the new vars to that existing block. The current block reads:

```yaml
    env:
      DATABASE_URL: postgres://forge:forge@localhost:5432/forge
      JWT_SECRET: ci-test-secret
      JWT_REFRESH_SECRET: ci-test-refresh-secret
      NODE_ENV: test
      PORT: 3001
```

Append (alphabetical-ish ordering, mirroring style of nearby keys):

```yaml
      ENABLE_TEST_ROUTES: '1'
      E2E_MODE: '1'
      LLM_PROVIDER: mock
```

`NODE_ENV: test` is already present — leave it. Resulting env block:

```yaml
    env:
      DATABASE_URL: postgres://forge:forge@localhost:5432/forge
      ENABLE_TEST_ROUTES: '1'
      E2E_MODE: '1'
      JWT_SECRET: ci-test-secret
      JWT_REFRESH_SECRET: ci-test-refresh-secret
      LLM_PROVIDER: mock
      NODE_ENV: test
      PORT: 3001
```

- [ ] **Step 12.3: Read current ai/complete.bru**

```bash
cat bruno/ai/complete.bru
```

Note the existing `assert {…}` block and any `script:post-response`.

- [ ] **Step 12.4: Update the .bru assertion**

The mock provider's default-script SSE stream is `["Hello", " world", "[done]"]`. The full SSE body should resemble:

```
data: {"text":"Hello"}
data: {"text":" world"}
data: {"text":"[done]"}
event: done
```

Update `bruno/ai/complete.bru`'s assertion block to:

```
assert {
  res.status: eq 200
  res.headers.content-type: contains text/event-stream
}

script:post-response {
  if (!res.body.includes('Hello')) {
    throw new Error('Expected mock provider SSE to contain "Hello"');
  }
  if (!res.body.includes('event: done')) {
    throw new Error('Expected SSE stream to terminate with event: done');
  }
}
```

(Adapt to whatever the existing post-response script's structure looks like — keep the body-check pattern, just point it at deterministic mock content.)

- [ ] **Step 12.5: Run Bruno locally to verify**

```bash
cd /Users/andrew/Code/forge
docker compose up -d postgres minio
set -a && source .env && set +a
# Override to mock for this test run:
export LLM_PROVIDER=mock ENABLE_TEST_ROUTES=1 E2E_MODE=1 NODE_ENV=test
cd packages/server && npx tsx src/server.ts &
SERVER_PID=$!
sleep 3
cd ../../bruno && npx @usebruno/cli run ai/complete.bru --env local
kill $SERVER_PID
```

Expected: `ai/complete.bru` reports PASS.

- [ ] **Step 12.6: Update bruno/README.md troubleshooting note**

Find the `**`ai/complete` returns `event: error`...` paragraph in `bruno/README.md`. Replace with:

```markdown
**`ai/complete` runs against a mock LLM provider in CI**: the `bruno-regression`
workflow sets `LLM_PROVIDER=mock` (see `.github/workflows/bruno-regression.yml`),
which selects `ChatMock` and serves deterministic SSE chunks per the registry in
`packages/server/src/plugins/langchain/mock-scripts.ts`. This means the CI test
asserts the mock provider's wire format, not a real OpenAI/Ollama response. To
test against a real provider locally, set `LLM_PROVIDER=openai` (with
`OPENAI_API_KEY`) or `LLM_PROVIDER=ollama` (with the docker-compose ollama
service running) in your `.env` and restart the server. Provider config is read
at boot.
```

- [ ] **Step 12.7: Run the full Bruno suite locally**

```bash
cd /Users/andrew/Code/forge
docker compose up -d postgres minio
set -a && source .env && set +a
export LLM_PROVIDER=mock ENABLE_TEST_ROUTES=1 E2E_MODE=1 NODE_ENV=test
cd packages/server && npm run seed
npx tsx src/server.ts &
SERVER_PID=$!
sleep 3
cd ../../bruno && npx @usebruno/cli run -r --env local
kill $SERVER_PID
```

Expected: full Bruno suite passes.

- [ ] **Step 12.8: Commit**

```bash
git add .github/workflows/bruno-regression.yml \
        bruno/ai/complete.bru \
        bruno/README.md
git commit -m "ci(bruno): use mock LLM provider in regression suite"
```

---

## Task 13: Final verification

- [ ] **Step 13.1: Run full Vitest coverage gate**

```bash
cd /Users/andrew/Code/forge
npm run test:coverage
```

Expected: 100% lines / branches / functions / statements across the entire monorepo. All thresholds in `.coverage-thresholds.json` met.

If any new file shows < 100%, identify the uncovered lines and add tests. The most likely culprit is an `else` branch in the secret check or a defensive throw in the mock-provider that needs a test that triggers it.

- [ ] **Step 13.2: Run full Bruno suite against the mock-mode server**

(Same commands as Step 12.7.)

Expected: all Bruno requests pass with their declared status codes.

- [ ] **Step 13.3: Run typecheck**

```bash
cd /Users/andrew/Code/forge
npm run typecheck
```

Expected: clean.

- [ ] **Step 13.4: Run lint**

```bash
npm run lint
```

Expected: clean.

- [ ] **Step 13.5: Manual end-to-end smoke**

```bash
cd /Users/andrew/Code/forge
docker compose up -d postgres minio
set -a && source .env && set +a
export LLM_PROVIDER=mock ENABLE_TEST_ROUTES=1 E2E_MODE=1 NODE_ENV=test
cd packages/server && npm run seed && npx tsx src/server.ts &
SERVER_PID=$!
sleep 3

# Read the secret:
SECRET=$(cat "${RUNNER_TEMP:-/tmp}/forge-e2e-secret")

# Reset should succeed:
curl -sS -X POST -H "X-E2E-Secret: $SECRET" http://localhost:3001/api/__test__/reset -w "\nHTTP %{http_code}\n"
# Expected: HTTP 204

# Reset without secret should 403:
curl -sS -X POST http://localhost:3001/api/__test__/reset -w "\nHTTP %{http_code}\n"
# Expected: HTTP 403

# Reset with Origin header should 403:
curl -sS -X POST -H "X-E2E-Secret: $SECRET" -H "Origin: http://evil.example" \
  http://localhost:3001/api/__test__/reset -w "\nHTTP %{http_code}\n"
# Expected: HTTP 403

# AI completion via mock with named script:
curl -sS -X POST -H "X-Mock-Script: autocomplete-typescript-react" \
  -H "Content-Type: application/json" \
  -d '{"context": "anything"}' \
  http://localhost:3001/api/ai/complete
# Expected: SSE stream with the typescript-react chunks

kill $SERVER_PID
docker compose down
```

Expected: all curls report the expected statuses. The mock provider streams the deterministic chunks.

- [ ] **Step 13.6: Verify boot fail-fasts**

```bash
# Production + ENABLE_TEST_ROUTES should fail-fast:
NODE_ENV=production ENABLE_TEST_ROUTES=1 cd packages/server && npx tsx src/server.ts
echo "exit: $?"
# Expected: stderr "Refusing to start", exit 1.

# Production + LLM_PROVIDER=mock should fail-fast:
NODE_ENV=production LLM_PROVIDER=mock cd packages/server && npx tsx src/server.ts
echo "exit: $?"
# Expected: stderr "Refusing to start", exit 1.
```

- [ ] **Step 13.7: Final commit if any docs need a final-pass**

If any verification step revealed something that needed an inline doc update, commit it. Otherwise skip.

```bash
git status
# If clean: skip.
# If changes: review and commit.
```

- [ ] **Step 13.8: Push branch and open PR**

```bash
git push -u origin <branch-name>
gh pr create --title "feat(e2e foundation 1a): server seams + Bruno CI fix" --body "$(cat <<EOF
## Summary

Foundation PR #1a of 9 for the [E2E Playwright rollout (#43)](https://github.com/multiandrewlab/forge/issues/43).

Lands the server-side seams that the E2E suite depends on:
- Mock LangChain provider (\`ChatMock extends BaseChatModel\`) with \`AsyncLocalStorage\`-threaded per-request scripting via \`X-Mock-Script\` header.
- Gated \`POST /api/__test__/reset\` endpoint that re-runs \`scripts/seed.sql\` for E2E test isolation; six layers of defense (NODE_ENV allowlist, strict env parsing, bind-address guard, route-registration gate, X-E2E-Secret per-request header, Origin rejection).
- \`env-guards\` lib (\`isE2EFlagSet\`, \`assertProductionGuards\`, \`generateE2ESecret\`) used by both server boot and route registration.
- Boot fail-fast that refuses startup when \`NODE_ENV\` is non-development/test combined with any test-mode flag.
- \`scripts/seed-guard.ts\` wrapper that refuses to run \`npm run seed\` against non-localhost \`DATABASE_URL\` unless \`ALLOW_DESTRUCTIVE_SEED=1\` is set.
- \`seed.sql\` shape regression test (no psql meta-commands).
- Vitest test discovery excludes \`e2e/**\` (the future Playwright specs would otherwise be picked up).

**Bruno CI fix folded in:** \`bruno-regression.yml\` now sets \`LLM_PROVIDER=mock\` so \`ai/complete.bru\` runs without \`OPENAI_API_KEY\`. The .bru assertion is updated to match the deterministic mock SSE shape; the README troubleshooting note is replaced.

Closes #44.

## Test plan

- [x] Vitest coverage gate (\`.coverage-thresholds.json\` 100% lines/branches/functions/statements) passes.
- [x] Bruno regression suite passes locally against the mock-mode server.
- [x] Manual smoke: secret-protected reset, Origin-blocked reset, mock-script SSE all behave as designed.
- [x] Boot fail-fast: \`NODE_ENV=production\` + any test-mode flag exits 1 with explanatory error.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review (run before handing off)

After all 13 tasks complete, the implementer reviews the plan against this spec checklist:

**Spec coverage:** every DoD checkbox in [issue #44](https://github.com/multiandrewlab/forge/issues/44) maps to at least one task above. Walk the issue's DoD list bottom-to-top and tick each off against a task number.

**Type consistency:**
- `MockScriptKey` (shared types) ↔ keys in `mockScripts` registry ↔ `X-Mock-Script` header values referenced in tests. Same set, no drift.
- `TestRoutesDeps.pgQuery` signature in `routes/__test__.ts` ↔ the function passed in from `app.ts`. Both `(sql: string) => Promise<unknown>`.
- `E2E_RESET_LOCK_ID` is `bigint` everywhere it appears.

**Placeholder scan:** any "TBD", "TODO", missing code, "similar to Task N", `<...>` placeholders? None — every step has concrete code or commands.

**Commit message style:** matches existing repo style (`feat(server):`, `ci(bruno):`, `test(server):`, `build:`). Cross-referenced against `git log --oneline -5`.

**Coverage gate:** the only files added under `packages/*/src/**` that aren't directly Vitest-covered are `packages/shared/src/types/mock-script-keys.ts` (excluded by addition to `vitest.config.ts` exclude list) and `packages/server/src/server.ts` (already excluded — the boot logic itself lives in the covered `packages/server/src/lib/bootstrap.ts`). All other new files have tests at 100% coverage.

---

## Execution-method choice

Per `CLAUDE.md`, the user picks the execution approach before this plan begins. Do **NOT** auto-select.

Present the user with these three options (verbatim):

> **How would you like to execute this plan?**
>
> 1. **Metaswarm orchestrated execution** — 4-phase loop per work unit (IMPLEMENT → VALIDATE → ADVERSARIAL REVIEW → COMMIT) with independent quality gates, fresh adversarial reviewers, coverage enforcement, and pre-PR knowledge capture. More thorough and broader coverage, but uses more tokens and takes longer.
> 2. **Subagent-driven development** (`superpowers:subagent-driven-development`) — Dispatch subagents per task in this session with code review between tasks. Faster, lighter-weight, lower token cost.
> 3. **Parallel session** (`superpowers:executing-plans`) — Execute in a separate session with batch checkpoints. Good for long-running work you want isolated.

**Default recommendation for issue #44 specifically:** the issue body recommends *metaswarm orchestrated execution* (option 1) because of the multi-file scope and the security-sensitive gating logic. The user is free to pick any of the three.

