# Issue #53 — E2E polish: auto-flake-issue, fixme-budget, doc updates

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Status

**Plan-review-gate:** 3/3 iterations exhausted, all FAIL. **User chose option C** (Strict-DoD): keep the TS-script approach with vitest tests; switch the previous-run lookup back to the GitHub API as the DoD verbatim requires ("looked up via GitHub API"). The remaining scope concerns flagged by reviewer 3 (script size, sticky-comment infra, fixme-budget pipeline) are accepted as known tradeoffs of choice C — addressing them would require option B (inline `actions/github-script`), which the user explicitly declined.

This iteration-4 plan applies targeted fixes for the blockers that ARE addressable within choice C:

- Switch from `actions/cache` to GH API artifact lookup (resolves Completeness-1 deviation).
- Add `.github/scripts/package.json` with `{ "type": "module" }` so dynamic imports return named exports (resolves Feasibility-1 + Feasibility-2).
- Drop `dumpCurrentFailures`; the script does everything in one CLI invocation (resolves Scope-5; minor reduction).
- Add an automated multi-line `test.fixme(` regression test in CI (resolves Completeness-2).
- Document `e2e-burst.yml` interaction explicitly (resolves Completeness-3; not a code change).

## Goal

Ship the polish layer for the E2E Playwright rollout (issue #43) — auto-flake-issue tooling, fixme-budget guard, the webkit/mobile project decision, and a final `e2e/README.md` pass.

## Architecture

A small TypeScript script (`.github/scripts/e2e-flake-tracker.ts`, ~180 lines) parses `playwright-report/results.json` and uses the GitHub REST API (plain `fetch` with `GITHUB_TOKEN`) to file or comment on `flaky-e2e`-labeled tracking issues. "Twice consecutively" is detected via the GitHub API: list previous main runs of `e2e-playwright.yml`, find the most recent OTHER run, download its `playwright-report` artifact zip, extract `results.json` via `unzip`, parse, intersect with current failures. A separate inline bash step in the workflow enforces a `test.fixme(` budget; it uses `grep -Pzro` so the regex spans newlines, satisfying the issue's multi-line failure-mode bullet, and a CI verification step asserts the regex catches a multi-line fixture. One new Playwright project (`chromium-mobile`) is added; webkit is documented as permanently out-of-scope.

`e2e-burst.yml` is a `workflow_dispatch`-only reusable that calls `e2e-playwright.yml` 5×. It inherits all the new steps; the `if:` conditions on auto-flake / sticky-#43 correctly skip them on burst's `workflow_dispatch` event. The fixme-budget guard runs on every invocation (including burst) — that's correct: single source of truth for the budget. No separate edits to `e2e-burst.yml`.

## Tech Stack

TypeScript, vitest (workspace member, ESM module), Playwright, GitHub Actions (`actions/github-script@v7`), plain `fetch` against the GitHub REST API, `unzip` (preinstalled on `ubuntu-latest`).

## User-confirmed decisions (2026-05-08)

- **Q1 fixme budget**: default `E2E_FIXME_BUDGET=7` (current count = 6).
- **Q2 dedupe**: known-flake-classes allowlist; if matched, comment on umbrella; else existing per-spec; else create new.
- **Q3 webkit/mobile**: `chromium-mobile` only (Pixel 5, scoped via `@mobile` grep tag); webkit permanently out-of-scope.
- **Iteration-4 (post-escalation)**: GH API artifact lookup over cache; ESM-typed scripts dir; automated multi-line regex test.

## Out of scope

- New e2e specs.
- Server changes.
- Updates to features the rollout already covers.
- The over-engineering concerns from gate iter-3 reviewer 3 (script size, sticky-comment infra, fixme-budget pipeline) — accepted as tradeoffs of choice C.

---

## File scope

| File                                                  | Action                       | In issue's stated scope?                                         |
| ----------------------------------------------------- | ---------------------------- | ---------------------------------------------------------------- |
| `.github/workflows/e2e-playwright.yml`                | modify                       | yes                                                              |
| `.github/scripts/e2e-flake-tracker.ts`                | create                       | yes (`*.{ts,js}`)                                                |
| `e2e/playwright.config.ts`                            | modify                       | yes                                                              |
| `e2e/README.md`                                       | modify                       | yes                                                              |
| `.github/scripts/__tests__/e2e-flake-tracker.test.ts` | create                       | adjacent test file                                               |
| `.github/scripts/vitest.config.ts`                    | create                       | adjacent test config                                             |
| `.github/scripts/package.json`                        | create                       | adjacent — required to make `.github/scripts/*.ts` ESM under tsx |
| `.github/known-flake-classes.json`                    | create                       | adjacent — required by Q2                                        |
| `vitest.workspace.ts`                                 | modify (one line)            | infra — registers the test config                                |
| `e2e/specs/_journey.spec.ts`                          | modify (one-line title edit) | required so chromium-mobile's `@mobile` grep selects this test   |

`vitest.config.ts` (root) is NOT modified. `.gitignore` already covers `e2e/.auth/` (line 35).

---

## Work Unit 1 — Auto-flake-tracker script (TDD)

**Files:**

- Create: `.github/scripts/e2e-flake-tracker.ts`
- Create: `.github/scripts/__tests__/e2e-flake-tracker.test.ts`
- Create: `.github/scripts/vitest.config.ts`
- Create: `.github/scripts/package.json`
- Create: `.github/known-flake-classes.json`
- Modify: `vitest.workspace.ts`

### Task 1.1: Set up the scripts directory as an ESM module + register test workspace

- [ ] **Step 1: Create `.github/scripts/package.json`**

```json
{
  "name": "@forge/github-scripts",
  "private": true,
  "type": "module",
  "$comment": "Marks .ts files in this directory as ESM under tsx so dynamic-import returns named exports rather than wrapping them in a default."
}
```

- [ ] **Step 2: Create `.github/scripts/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'github-scripts',
    include: ['__tests__/**/*.test.ts'],
    environment: 'node',
  },
});
```

- [ ] **Step 3: Add the workspace member** by editing `vitest.workspace.ts`:

```ts
import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  'packages/server/vitest.config.ts',
  'packages/client/vitest.config.ts',
  'packages/shared/vitest.config.ts',
  '.github/scripts/vitest.config.ts',
]);
```

- [ ] **Step 4: Create `.github/known-flake-classes.json`**

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$comment": "Maps spec-path-substring to an umbrella issue number. The auto-flake-tracker comments on the umbrella issue instead of filing a per-spec duplicate. Initially empty; populate when a root-cause umbrella issue is filed and produces multi-spec symptoms (cf. closed #75).",
  "classes": {}
}
```

- [ ] **Step 5: Verify the workspace runs cleanly with no new tests yet**

Run: `npm test`
Expected: PASS — all existing packages green; `github-scripts` workspace runs with `--passWithNoTests` (no test files yet).

- [ ] **Step 6: Verify the root coverage gate is unaffected**

Run: `npm run test:coverage`
Expected: PASS — 100% on `packages/*` unchanged. `.github/scripts/` is not in `coverage.include`.

- [ ] **Step 7: Commit**

```bash
git add .github/scripts/package.json .github/scripts/vitest.config.ts vitest.workspace.ts .github/known-flake-classes.json
git commit -m "feat(ci): #53 register .github/scripts ESM workspace + known-flake-classes manifest"
```

### Task 1.2: TDD — `parseResults()`, `decideAction()`, `intersectByIdentity()`

These three pure functions are the script's logic core.

- [ ] **Step 1: Write the failing tests**

Create `.github/scripts/__tests__/e2e-flake-tracker.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  parseResults,
  decideAction,
  intersectByIdentity,
  type Action,
} from '../e2e-flake-tracker.js';

function writeReport(suites: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'flake-tracker-'));
  const path = join(dir, 'results.json');
  writeFileSync(path, JSON.stringify({ suites }));
  return path;
}

describe('parseResults', () => {
  it('returns [] and warns when report file is missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseResults('/no/such/path/results.json')).toEqual([]);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('missing'));
    warn.mockRestore();
  });

  it('returns [] and warns when report JSON is malformed', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseResults(__filename)).toEqual([]); // .ts source ≠ valid JSON
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('malformed'));
    warn.mockRestore();
  });

  it('extracts hard-failed specs and excludes flaky (passed-on-retry)', () => {
    const path = writeReport([
      {
        file: 'specs/posts/edit-own-post.spec.ts',
        specs: [
          {
            title: 'edits own post',
            file: 'specs/posts/edit-own-post.spec.ts',
            ok: false,
            tests: [{ status: 'unexpected', results: [{ status: 'failed' }] }],
          },
          {
            title: 'cancels edit',
            file: 'specs/posts/edit-own-post.spec.ts',
            ok: true,
            tests: [{ status: 'expected', results: [{ status: 'passed' }] }],
          },
          {
            title: 'flaky one',
            file: 'specs/posts/edit-own-post.spec.ts',
            ok: true,
            tests: [{ status: 'flaky', results: [{ status: 'failed' }, { status: 'passed' }] }],
          },
        ],
      },
    ]);
    expect(parseResults(path)).toEqual([
      { file: 'specs/posts/edit-own-post.spec.ts', title: 'edits own post' },
    ]);
  });

  it('recurses into nested suites', () => {
    const path = writeReport([
      {
        title: 'chromium-desktop',
        suites: [
          {
            file: 'specs/auth/login.spec.ts',
            specs: [
              {
                title: 'logs in',
                file: 'specs/auth/login.spec.ts',
                ok: false,
                tests: [{ status: 'unexpected', results: [{ status: 'failed' }] }],
              },
            ],
          },
        ],
      },
    ]);
    expect(parseResults(path)).toEqual([{ file: 'specs/auth/login.spec.ts', title: 'logs in' }]);
  });
});

describe('decideAction', () => {
  const baseSpec = { file: 'specs/posts/edit-own-post.spec.ts', title: 'edits own post' };

  it('comments on umbrella when known-flake-classes matches', () => {
    expect(
      decideAction({ spec: baseSpec, knownClasses: { 'specs/posts/': 75 }, existingIssues: [] }),
    ).toEqual<Action>({ type: 'comment', issueNumber: 75, reason: 'umbrella' });
  });

  it('comments on existing per-spec issue', () => {
    expect(
      decideAction({
        spec: baseSpec,
        knownClasses: {},
        existingIssues: [
          { number: 200, title: 'flaky-e2e: specs/posts/edit-own-post.spec.ts > edits own post' },
        ],
      }),
    ).toEqual<Action>({ type: 'comment', issueNumber: 200, reason: 'existing-per-spec' });
  });

  it('creates a new issue when nothing matches', () => {
    expect(decideAction({ spec: baseSpec, knownClasses: {}, existingIssues: [] })).toEqual<Action>({
      type: 'create',
      title: 'flaky-e2e: specs/posts/edit-own-post.spec.ts > edits own post',
    });
  });

  it('umbrella precedence over existing per-spec', () => {
    expect(
      decideAction({
        spec: baseSpec,
        knownClasses: { 'specs/posts/': 75 },
        existingIssues: [
          { number: 200, title: 'flaky-e2e: specs/posts/edit-own-post.spec.ts > edits own post' },
        ],
      }),
    ).toEqual<Action>({ type: 'comment', issueNumber: 75, reason: 'umbrella' });
  });
});

describe('intersectByIdentity', () => {
  it('returns specs in BOTH lists matched on file+title', () => {
    expect(
      intersectByIdentity(
        [
          { file: 'specs/auth/login.spec.ts', title: 'logs in' },
          { file: 'specs/posts/edit.spec.ts', title: 'edits' },
        ],
        [
          { file: 'specs/auth/login.spec.ts', title: 'logs in' },
          { file: 'specs/posts/delete.spec.ts', title: 'deletes' },
        ],
      ),
    ).toEqual([{ file: 'specs/auth/login.spec.ts', title: 'logs in' }]);
  });

  it('returns [] when one side is empty', () => {
    expect(intersectByIdentity([{ file: 'a', title: 'a' }], [])).toEqual([]);
    expect(intersectByIdentity([], [{ file: 'a', title: 'a' }])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run --project github-scripts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `.github/scripts/e2e-flake-tracker.ts`:

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

export interface FailedSpec {
  file: string;
  title: string;
}

export interface ExistingIssue {
  number: number;
  title: string;
}

export type Action =
  | { type: 'comment'; issueNumber: number; reason: 'umbrella' | 'existing-per-spec' }
  | { type: 'create'; title: string };

interface PwSpec {
  title: string;
  file: string;
  ok: boolean;
  tests?: Array<{ status: string }>;
}
interface PwSuite {
  file?: string;
  title?: string;
  suites?: PwSuite[];
  specs?: PwSpec[];
}

export function parseResults(path: string): FailedSpec[] {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.warn(`[flake-tracker] results.json missing at ${path}; no-op.`);
    return [];
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    console.warn(`[flake-tracker] results.json malformed at ${path}; no-op.`);
    return [];
  }
  const out: FailedSpec[] = [];
  walk((parsed as { suites?: unknown[] }).suites ?? [], out);
  return out;
}

function walk(nodes: unknown[], out: FailedSpec[]): void {
  for (const node of nodes as PwSuite[]) {
    if (node.specs) {
      for (const spec of node.specs) {
        const status = spec.tests?.[0]?.status;
        if (status === 'unexpected' && !spec.ok) {
          out.push({ file: spec.file, title: spec.title });
        }
      }
    }
    if (node.suites) walk(node.suites, out);
  }
}

export function decideAction(inputs: {
  spec: FailedSpec;
  knownClasses: Record<string, number>;
  existingIssues: ExistingIssue[];
}): Action {
  const { spec, knownClasses, existingIssues } = inputs;
  const title = `flaky-e2e: ${spec.file} > ${spec.title}`;

  for (const [glob, issueNumber] of Object.entries(knownClasses)) {
    if (spec.file.includes(glob)) {
      return { type: 'comment', issueNumber, reason: 'umbrella' };
    }
  }

  const existing = existingIssues.find((i) => i.title === title);
  if (existing) {
    return { type: 'comment', issueNumber: existing.number, reason: 'existing-per-spec' };
  }

  return { type: 'create', title };
}

export function intersectByIdentity(a: FailedSpec[], b: FailedSpec[]): FailedSpec[] {
  const bSet = new Set(b.map((s) => `${s.file}\0${s.title}`));
  return a.filter((s) => bSet.has(`${s.file}\0${s.title}`));
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run --project github-scripts`
Expected: PASS — 10 tests green.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/e2e-flake-tracker.ts .github/scripts/__tests__/e2e-flake-tracker.test.ts
git commit -m "feat(ci): #53 e2e-flake-tracker pure logic (parse, decide, intersect)"
```

### Task 1.3: TDD — `runTracker()` orchestrator (positive + negative paths)

- [ ] **Step 1: Append the test**

```ts
import { runTracker, type GitHubClient } from '../e2e-flake-tracker.js';

function makeClient(over: Partial<GitHubClient> = {}): GitHubClient {
  return {
    listOpenFlakyIssues: vi.fn().mockResolvedValue([]),
    createIssue: vi.fn().mockResolvedValue(undefined),
    commentOnIssue: vi.fn().mockResolvedValue(undefined),
    postPrComment: vi.fn().mockResolvedValue(undefined),
    ...over,
  };
}

describe('runTracker — push event', () => {
  const baseSpec = { file: 'specs/posts/edit-own-post.spec.ts', title: 'edits own post' };

  it('no-ops when no specs failed', async () => {
    const client = makeClient();
    await runTracker({
      event: 'push',
      currentFailures: [],
      previousFailures: [baseSpec],
      knownClasses: {},
      client,
    });
    expect(client.createIssue).not.toHaveBeenCalled();
    expect(client.commentOnIssue).not.toHaveBeenCalled();
  });

  it('skips when spec failed THIS run only', async () => {
    const client = makeClient();
    await runTracker({
      event: 'push',
      currentFailures: [baseSpec],
      previousFailures: [],
      knownClasses: {},
      client,
    });
    expect(client.createIssue).not.toHaveBeenCalled();
    expect(client.commentOnIssue).not.toHaveBeenCalled();
  });

  it('creates a new issue when same spec failed in BOTH runs (positive)', async () => {
    const client = makeClient({ listOpenFlakyIssues: vi.fn().mockResolvedValue([]) });
    await runTracker({
      event: 'push',
      currentFailures: [baseSpec],
      previousFailures: [baseSpec],
      knownClasses: {},
      client,
    });
    expect(client.createIssue).toHaveBeenCalledWith({
      title: 'flaky-e2e: specs/posts/edit-own-post.spec.ts > edits own post',
      body: expect.stringContaining('two consecutive main runs'),
      labels: ['flaky-e2e'],
    });
    expect(client.commentOnIssue).not.toHaveBeenCalled();
  });

  it('comments on umbrella when known-flake-classes matches (twice-failed)', async () => {
    const client = makeClient();
    await runTracker({
      event: 'push',
      currentFailures: [baseSpec],
      previousFailures: [baseSpec],
      knownClasses: { 'specs/posts/': 75 },
      client,
    });
    expect(client.commentOnIssue).toHaveBeenCalledWith(
      75,
      expect.stringContaining('specs/posts/edit-own-post.spec.ts > edits own post'),
    );
    expect(client.createIssue).not.toHaveBeenCalled();
  });

  it('comments on existing per-spec when twice-failed and one is open', async () => {
    const client = makeClient({
      listOpenFlakyIssues: vi
        .fn()
        .mockResolvedValue([
          { number: 200, title: 'flaky-e2e: specs/posts/edit-own-post.spec.ts > edits own post' },
        ]),
    });
    await runTracker({
      event: 'push',
      currentFailures: [baseSpec],
      previousFailures: [baseSpec],
      knownClasses: {},
      client,
    });
    expect(client.commentOnIssue).toHaveBeenCalledWith(200, expect.stringContaining('Auto-flake'));
    expect(client.createIssue).not.toHaveBeenCalled();
  });

  it('tolerates GH API errors per-spec', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const client = makeClient({
      createIssue: vi.fn().mockRejectedValue(new Error('rate-limited')),
    });
    await expect(
      runTracker({
        event: 'push',
        currentFailures: [baseSpec, { file: 'specs/auth/login.spec.ts', title: 'logs in' }],
        previousFailures: [baseSpec, { file: 'specs/auth/login.spec.ts', title: 'logs in' }],
        knownClasses: {},
        client,
      }),
    ).resolves.toBeUndefined();
    expect(client.createIssue).toHaveBeenCalledTimes(2);
    err.mockRestore();
  });
});

describe('runTracker — pull_request event', () => {
  it('posts a single PR comment listing failures with tracking-issue links', async () => {
    const client = makeClient({
      listOpenFlakyIssues: vi
        .fn()
        .mockResolvedValue([
          { number: 200, title: 'flaky-e2e: specs/posts/edit-own-post.spec.ts > edits own post' },
        ]),
    });
    await runTracker({
      event: 'pull_request',
      prNumber: 99,
      currentFailures: [
        { file: 'specs/posts/edit-own-post.spec.ts', title: 'edits own post' },
        { file: 'specs/auth/login.spec.ts', title: 'logs in' },
      ],
      previousFailures: [],
      knownClasses: {},
      client,
    });
    expect(client.postPrComment).toHaveBeenCalledTimes(1);
    const [pr, body] = (client.postPrComment as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(pr).toBe(99);
    expect(body).toContain('test.fixme');
    expect(body).toContain('specs/posts/edit-own-post.spec.ts');
    expect(body).toContain('#200');
    expect(body).toContain('no tracking issue yet');
  });

  it('no-ops when no specs failed', async () => {
    const client = makeClient();
    await runTracker({
      event: 'pull_request',
      prNumber: 99,
      currentFailures: [],
      previousFailures: [],
      knownClasses: {},
      client,
    });
    expect(client.postPrComment).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run --project github-scripts`
Expected: FAIL — `runTracker` / `GitHubClient` not exported.

- [ ] **Step 3: Implement**

Append to `.github/scripts/e2e-flake-tracker.ts`:

```ts
export interface GitHubClient {
  listOpenFlakyIssues(): Promise<ExistingIssue[]>;
  createIssue(args: { title: string; body: string; labels: string[] }): Promise<void>;
  commentOnIssue(issueNumber: number, body: string): Promise<void>;
  postPrComment(prNumber: number, body: string): Promise<void>;
}

export type RunTrackerInputs =
  | {
      event: 'push';
      currentFailures: FailedSpec[];
      previousFailures: FailedSpec[];
      knownClasses: Record<string, number>;
      client: GitHubClient;
    }
  | {
      event: 'pull_request';
      prNumber: number;
      currentFailures: FailedSpec[];
      previousFailures: FailedSpec[];
      knownClasses: Record<string, number>;
      client: GitHubClient;
    };

export async function runTracker(inputs: RunTrackerInputs): Promise<void> {
  if (inputs.currentFailures.length === 0) return;

  if (inputs.event === 'pull_request') {
    const existingIssues = await inputs.client.listOpenFlakyIssues();
    const lines: string[] = [':warning: **E2E specs failed in this run.**', ''];
    for (const spec of inputs.currentFailures) {
      const expectedTitle = `flaky-e2e: ${spec.file} > ${spec.title}`;
      const existing = existingIssues.find((i) => i.title === expectedTitle);
      const linkPart = existing
        ? `tracking issue: #${existing.number}`
        : '(no tracking issue yet — auto-tracker files one if it fails again on `main`)';
      lines.push(`- \`${spec.file}\` > \`${spec.title}\` — consider \`test.fixme()\` ${linkPart}`);
    }
    await inputs.client.postPrComment(inputs.prNumber, lines.join('\n'));
    return;
  }

  // event === 'push' (main only — scoped by the workflow's `if:`)
  const twiceFailed = intersectByIdentity(inputs.currentFailures, inputs.previousFailures);
  if (twiceFailed.length === 0) return;

  const existingIssues = await inputs.client.listOpenFlakyIssues();

  for (const spec of twiceFailed) {
    try {
      const action = decideAction({
        spec,
        knownClasses: inputs.knownClasses,
        existingIssues,
      });
      if (action.type === 'comment') {
        await inputs.client.commentOnIssue(
          action.issueNumber,
          `Auto-flake: \`${spec.file}\` > \`${spec.title}\` failed on two consecutive main runs.`,
        );
      } else {
        await inputs.client.createIssue({
          title: action.title,
          body:
            `Auto-filed by \`.github/scripts/e2e-flake-tracker.ts\`.\n\n` +
            `Spec: \`${spec.file}\`\nTitle: \`${spec.title}\`\n\n` +
            `Failed on two consecutive main runs. De-flake via fix or \`test.fixme()\`; ` +
            `close this issue once the spec is stable.`,
          labels: ['flaky-e2e'],
        });
      }
    } catch (err) {
      console.error(`[flake-tracker] failed to handle ${spec.file} > ${spec.title}:`, err);
    }
  }
}
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `npx vitest run --project github-scripts`
Expected: PASS — 18 tests green.

- [ ] **Step 5: Commit**

```bash
git add .github/scripts/e2e-flake-tracker.ts .github/scripts/__tests__/e2e-flake-tracker.test.ts
git commit -m "feat(ci): #53 e2e-flake-tracker runTracker (push + pull_request)"
```

### Task 1.4: GH-API client + URL builders + previous-run lookup + CLI entry

This is the largest task. It adds: (a) the `fetch`-based `createGitHubClient`, (b) URL builders for the previous-run lookup (testable), (c) the artifact-zip download + unzip + parse path (CLI plumbing, `c8 ignore`), and (d) the CLI entry that dispatches based on event.

- [ ] **Step 1: Append unit tests for `createGitHubClient` and the URL builders**

```ts
import {
  createGitHubClient,
  buildPreviousRunsUrl,
  buildArtifactsUrl,
  pickReportArtifact,
} from '../e2e-flake-tracker.js';

describe('createGitHubClient', () => {
  it('listOpenFlakyIssues GETs the right URL', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ number: 1, title: 'flaky-e2e: a > b' }],
      text: async () => '',
    });
    const client = createGitHubClient({ owner: 'o', repo: 'r', token: 't', fetchImpl: fetchMock });
    expect(await client.listOpenFlakyIssues()).toEqual([{ number: 1, title: 'flaky-e2e: a > b' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/o/r/issues?labels=flaky-e2e&state=open&per_page=100',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer t' }),
      }),
    );
  });

  it('createIssue POSTs to /issues', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}), text: async () => '' });
    const client = createGitHubClient({ owner: 'o', repo: 'r', token: 't', fetchImpl: fetchMock });
    await client.createIssue({ title: 't', body: 'b', labels: ['flaky-e2e'] });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/o/r/issues',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('commentOnIssue POSTs to /issues/{n}/comments', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}), text: async () => '' });
    const client = createGitHubClient({ owner: 'o', repo: 'r', token: 't', fetchImpl: fetchMock });
    await client.commentOnIssue(75, 'hi');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/o/r/issues/75/comments',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('postPrComment POSTs to /issues/{n}/comments (PR numbers share the issues namespace)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({}), text: async () => '' });
    const client = createGitHubClient({ owner: 'o', repo: 'r', token: 't', fetchImpl: fetchMock });
    await client.postPrComment(99, 'hi');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/o/r/issues/99/comments',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('throws on non-2xx', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 403, text: async () => 'forbidden' });
    const client = createGitHubClient({ owner: 'o', repo: 'r', token: 't', fetchImpl: fetchMock });
    await expect(client.commentOnIssue(75, 'hi')).rejects.toThrow(/403/);
  });
});

describe('previous-run URL builders', () => {
  it('buildPreviousRunsUrl filters to main, completed, excluding pull-requests', () => {
    expect(buildPreviousRunsUrl('o', 'r', 'e2e-playwright.yml')).toBe(
      'https://api.github.com/repos/o/r/actions/workflows/e2e-playwright.yml/runs?branch=main&status=completed&exclude_pull_requests=true&per_page=10',
    );
  });

  it('buildArtifactsUrl uses run id', () => {
    expect(buildArtifactsUrl('o', 'r', 99)).toBe(
      'https://api.github.com/repos/o/r/actions/runs/99/artifacts',
    );
  });

  it('pickReportArtifact returns the playwright-report artifact', () => {
    expect(
      pickReportArtifact([
        { id: 1, name: 'e2e-server-logs', archive_download_url: 'x' },
        { id: 2, name: 'playwright-report', archive_download_url: 'y' },
      ]),
    ).toEqual({ id: 2, name: 'playwright-report', archive_download_url: 'y' });
  });

  it('pickReportArtifact returns null if absent', () => {
    expect(pickReportArtifact([{ id: 1, name: 'other', archive_download_url: 'x' }])).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `npx vitest run --project github-scripts`
Expected: FAIL — exports not found.

- [ ] **Step 3: Implement**

Append to `.github/scripts/e2e-flake-tracker.ts`:

```ts
const GH_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: 'application/vnd.github+json',
  'Content-Type': 'application/json',
  'X-GitHub-Api-Version': '2022-11-28',
});

export function buildPreviousRunsUrl(owner: string, repo: string, workflowFile: string): string {
  return (
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflowFile}` +
    `/runs?branch=main&status=completed&exclude_pull_requests=true&per_page=10`
  );
}

export function buildArtifactsUrl(owner: string, repo: string, runId: number): string {
  return `https://api.github.com/repos/${owner}/${repo}/actions/runs/${runId}/artifacts`;
}

export function pickReportArtifact(
  artifacts: Array<{ id: number; name: string; archive_download_url: string }>,
): { id: number; name: string; archive_download_url: string } | null {
  return artifacts.find((a) => a.name === 'playwright-report') ?? null;
}

export function createGitHubClient(opts: {
  owner: string;
  repo: string;
  token: string;
  fetchImpl?: typeof fetch;
}): GitHubClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = `https://api.github.com/repos/${opts.owner}/${opts.repo}`;
  const expectOk = async (res: Response, label: string): Promise<void> => {
    if (!res.ok) throw new Error(`${label} ${res.status}: ${await res.text()}`);
  };
  return {
    async listOpenFlakyIssues() {
      const res = await fetchImpl(`${base}/issues?labels=flaky-e2e&state=open&per_page=100`, {
        headers: GH_HEADERS(opts.token),
      });
      await expectOk(res, 'listOpenFlakyIssues');
      const items = (await res.json()) as Array<{ number: number; title: string }>;
      return items.map((i) => ({ number: i.number, title: i.title }));
    },
    async createIssue(args) {
      const res = await fetchImpl(`${base}/issues`, {
        method: 'POST',
        headers: GH_HEADERS(opts.token),
        body: JSON.stringify(args),
      });
      await expectOk(res, 'createIssue');
    },
    async commentOnIssue(issueNumber, body) {
      const res = await fetchImpl(`${base}/issues/${issueNumber}/comments`, {
        method: 'POST',
        headers: GH_HEADERS(opts.token),
        body: JSON.stringify({ body }),
      });
      await expectOk(res, 'commentOnIssue');
    },
    async postPrComment(prNumber, body) {
      const res = await fetchImpl(`${base}/issues/${prNumber}/comments`, {
        method: 'POST',
        headers: GH_HEADERS(opts.token),
        body: JSON.stringify({ body }),
      });
      await expectOk(res, 'postPrComment');
    },
  };
}

/* c8 ignore start — CLI plumbing tested via the manual smoke + first real CI run */
async function fetchPreviousRunFailedSpecs(args: {
  owner: string;
  repo: string;
  token: string;
  currentRunId: number;
}): Promise<FailedSpec[]> {
  const headers = GH_HEADERS(args.token);
  const runsRes = await fetch(buildPreviousRunsUrl(args.owner, args.repo, 'e2e-playwright.yml'), {
    headers,
  });
  if (!runsRes.ok) throw new Error(`runs ${runsRes.status}`);
  const runsBody = (await runsRes.json()) as { workflow_runs: Array<{ id: number }> };
  const previous = runsBody.workflow_runs.find((r) => r.id !== args.currentRunId);
  if (!previous) {
    console.warn('[flake-tracker] no previous main run found; skipping twice-failed lookup');
    return [];
  }

  const artRes = await fetch(buildArtifactsUrl(args.owner, args.repo, previous.id), { headers });
  if (!artRes.ok) throw new Error(`artifacts ${artRes.status}`);
  const artBody = (await artRes.json()) as {
    artifacts: Array<{ id: number; name: string; archive_download_url: string }>;
  };
  const artifact = pickReportArtifact(artBody.artifacts);
  if (!artifact) {
    console.warn(
      `[flake-tracker] previous run ${previous.id} has no playwright-report artifact (likely retention-evicted); skipping`,
    );
    return [];
  }

  const zipRes = await fetch(artifact.archive_download_url, { headers });
  if (!zipRes.ok) throw new Error(`zip ${zipRes.status}`);
  const buf = Buffer.from(await zipRes.arrayBuffer());
  const tmpZip = `/tmp/flake-tracker-${previous.id}.zip`;
  const tmpDir = `/tmp/flake-tracker-${previous.id}`;
  writeFileSync(tmpZip, buf);
  execSync(`mkdir -p ${tmpDir} && unzip -o ${tmpZip} -d ${tmpDir} > /dev/null`);
  return parseResults(`${tmpDir}/results.json`);
}

async function cliMain(): Promise<void> {
  const env = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`missing env ${k}`);
    return v;
  };
  const token = env('GITHUB_TOKEN');
  const [owner, repo] = env('GITHUB_REPOSITORY').split('/');
  const eventName = env('GITHUB_EVENT_NAME') as 'push' | 'pull_request';
  const reportPath = process.env.RESULTS_JSON ?? 'e2e/playwright-report/results.json';
  const knownClassesPath = process.env.KNOWN_CLASSES ?? '.github/known-flake-classes.json';

  const currentFailures = parseResults(reportPath);

  let knownClasses: Record<string, number> = {};
  try {
    const raw = readFileSync(knownClassesPath, 'utf8');
    const parsed = JSON.parse(raw) as { classes?: Record<string, number> };
    knownClasses = parsed.classes ?? {};
  } catch {
    /* keep default */
  }

  const client = createGitHubClient({ owner, repo, token });

  if (eventName === 'pull_request') {
    const prNumber = Number(env('PR_NUMBER'));
    await runTracker({
      event: 'pull_request',
      prNumber,
      currentFailures,
      previousFailures: [],
      knownClasses,
      client,
    });
    return;
  }

  if (eventName === 'push') {
    const currentRunId = Number(env('GITHUB_RUN_ID'));
    let previousFailures: FailedSpec[] = [];
    try {
      previousFailures = await fetchPreviousRunFailedSpecs({
        owner,
        repo,
        token,
        currentRunId,
      });
    } catch (err) {
      console.warn('[flake-tracker] previous-run lookup failed:', err);
      console.log(
        '::warning::e2e-flake-tracker: previous-run lookup failed; auto-flake decisions skipped this run',
      );
    }
    await runTracker({
      event: 'push',
      currentFailures,
      previousFailures,
      knownClasses,
      client,
    });
    return;
  }

  console.log(`[flake-tracker] event ${eventName} not handled; no-op.`);
}

if (process.argv[1]?.endsWith('e2e-flake-tracker.ts')) {
  cliMain().catch((err) => {
    console.error('[flake-tracker] fatal:', err);
    console.log('::warning::e2e-flake-tracker error — see preceding log');
    process.exitCode = 0;
  });
}
/* c8 ignore stop */
```

- [ ] **Step 4: Run the tests and verify all pass**

Run: `npx vitest run --project github-scripts`
Expected: PASS — 27 tests green (10 + 8 + 5 client + 4 URL builders).

- [ ] **Step 5: Verify the root coverage gate is unaffected**

Run: `npm run test:coverage`
Expected: PASS — 100% on `packages/*` unchanged.

- [ ] **Step 6: Commit**

```bash
git add .github/scripts/e2e-flake-tracker.ts .github/scripts/__tests__/e2e-flake-tracker.test.ts
git commit -m "feat(ci): #53 e2e-flake-tracker GH-API client + previous-run artifact lookup"
```

---

## Work Unit 2 — Wire the workflow

**Files:**

- Modify: `.github/workflows/e2e-playwright.yml`

### Task 2.1: Idempotent `flaky-e2e` label creation

- [ ] **Step 1: Insert immediately after `Lint guard — testuser is reserved for Bruno`**

```yaml
- name: Ensure flaky-e2e label exists
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  run: |
    gh label create flaky-e2e \
      --description "Auto-tracked flaky E2E spec" \
      --color D93F0B || true
```

- [ ] **Step 2: Verify YAML parses**

Run: `npx js-yaml .github/workflows/e2e-playwright.yml > /dev/null`
Expected: no syntax error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e-playwright.yml
git commit -m "ci: #53 ensure flaky-e2e label exists (idempotent)"
```

### Task 2.2: Auto-flake-tracker step (post-test, after Upload Playwright report)

- [ ] **Step 1: Insert immediately AFTER `Upload Playwright report`**

```yaml
- name: Auto-flake tracker
  # Skips on fork PRs (GITHUB_TOKEN is read-only on those, POSTs would 403).
  # Skips on burst's workflow_dispatch event (which calls this workflow as
  # reusable). Runs on same-repo PRs and main pushes.
  if: |
    always() &&
    (
      (github.event_name == 'push' && github.ref == 'refs/heads/main') ||
      (
        github.event_name == 'pull_request' &&
        github.event.pull_request.head.repo.full_name == github.repository
      )
    )
  env:
    GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
    GITHUB_REPOSITORY: ${{ github.repository }}
    GITHUB_EVENT_NAME: ${{ github.event_name }}
    GITHUB_RUN_ID: ${{ github.run_id }}
    PR_NUMBER: ${{ github.event.pull_request.number }}
    RESULTS_JSON: e2e/playwright-report/results.json
    KNOWN_CLASSES: .github/known-flake-classes.json
  # || true ensures a tracker bug never fails the e2e workflow. The script
  # ALSO sets process.exitCode=0 on its own catch block. Errors are
  # surfaced as ::warning:: annotations (visible in the run summary).
  run: npx tsx .github/scripts/e2e-flake-tracker.ts || true
```

- [ ] **Step 2: Verify YAML parses**

Run: `npx js-yaml .github/workflows/e2e-playwright.yml > /dev/null`
Expected: no syntax error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e-playwright.yml
git commit -m "ci: #53 invoke e2e-flake-tracker (GH-API previous-run lookup, fork-PR safe)"
```

---

## Work Unit 3 — Fixme-budget guard + multi-line regression test + #43 sticky comment

**Files:**

- Modify: `.github/workflows/e2e-playwright.yml`

### Task 3.1: Multi-line-aware fixme-budget guard

- [ ] **Step 1: Insert immediately after `Ensure flaky-e2e label exists`**

```yaml
- name: Fixme-budget guard
  # Counts test.fixme(...) calls in e2e/specs. Uses grep -Pzo so the regex
  # matches across newlines (PCRE \s includes \n; -z treats input as one
  # null-terminated record). Satisfies issue #53's failure-mode bullet
  # about multi-line test.fixme( calls.
  env:
    E2E_FIXME_BUDGET: '7'
  run: |
    count=$(grep -Pzro 'test\.fixme\s*\(' e2e/specs/ | tr '\0' '\n' | grep -c 'test\.fixme' || true)
    echo "current test.fixme count: $count"
    echo "current budget: $E2E_FIXME_BUDGET"
    if [ "$count" -gt "$E2E_FIXME_BUDGET" ]; then
      echo "::error::test.fixme budget exceeded ($count > $E2E_FIXME_BUDGET). Drain the queue or raise E2E_FIXME_BUDGET in the workflow file."
      exit 1
    fi
```

- [ ] **Step 2: Insert the multi-line regex regression test IMMEDIATELY AFTER the budget guard**

```yaml
- name: Fixme-budget regex regression test
  # Asserts the multi-line regex AND the counting pipeline both work.
  # Two fixtures: (a) one multi-line test.fixme(\n(...)) — exercises the
  # regex's `\s*` cross-newline match (PCRE -P plus null-data -z); (b)
  # three single-line test.fixme(...) calls — exercises the counting
  # pipeline (catches `tr -d '\0'` regressions that would collapse all
  # matches into one line).
  run: |
    # Fixture A — multi-line regex
    fixture_a=$(mktemp /tmp/fixme-multiline.XXXXXX.ts)
    cat > "$fixture_a" <<'EOF'
    test.fixme
      ('multi-line should match', async () => {});
    EOF
    got_a=$(grep -Pzro 'test\.fixme\s*\(' "$fixture_a" | tr '\0' '\n' | grep -c 'test\.fixme' || true)
    rm -f "$fixture_a"
    if [ "$got_a" != "1" ]; then
      echo "::error::Multi-line regex regression: expected 1 match in multi-line fixture, got $got_a"
      exit 1
    fi

    # Fixture B — multi-match counting pipeline
    fixture_b=$(mktemp /tmp/fixme-multimatch.XXXXXX.ts)
    cat > "$fixture_b" <<'EOF'
    test.fixme('one', async () => {});
    test.fixme('two', async () => {});
    test.fixme('three', async () => {});
    EOF
    got_b=$(grep -Pzro 'test\.fixme\s*\(' "$fixture_b" | tr '\0' '\n' | grep -c 'test\.fixme' || true)
    rm -f "$fixture_b"
    if [ "$got_b" != "3" ]; then
      echo "::error::Counting pipeline regression: expected 3 matches in 3-line fixture, got $got_b (likely 'tr -d \\0' instead of 'tr \\0 \\n')"
      exit 1
    fi

    echo "Fixme-budget regex regression tests passed (multi-line: 1, multi-match: 3)"
```

- [ ] **Step 3: Verify the count locally on macOS** (Linux CI uses GNU grep)

Run: `grep -Pzro 'test\.fixme\s*\(' e2e/specs/ 2>/dev/null | tr -d '\0' | grep -c 'test\.fixme' || ggrep -Pzro 'test\.fixme\s*\(' e2e/specs/ | tr -d '\0' | ggrep -c 'test\.fixme'`
Expected: `6`. (macOS BSD grep doesn't support `-P`; install GNU grep via `brew install grep` and use `ggrep` to validate locally — or skip and rely on CI.)

- [ ] **Step 4: Verify YAML parses**

Run: `npx js-yaml .github/workflows/e2e-playwright.yml > /dev/null`
Expected: no syntax error.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/e2e-playwright.yml
git commit -m "ci: #53 fixme-budget guard + multi-line regex regression test"
```

### Task 3.2: Sticky-comment update to tracking issue #43 (main-push only)

- [ ] **Step 1: Insert AFTER `Auto-flake tracker`**

```yaml
- name: Sticky-update tracking issue #43 with current fixme count
  if: github.event_name == 'push' && github.ref == 'refs/heads/main'
  uses: actions/github-script@v7
  env:
    MARKER: '<!-- e2e-fixme-count-sticky -->'
  with:
    script: |
      const { execSync } = require('node:child_process');
      const out = execSync(
        "grep -Pzro 'test\\.fixme\\s*\\(' e2e/specs/ | tr '\\0' '\\n' | grep -c 'test\\.fixme' || true",
        { encoding: 'utf8', shell: '/bin/bash' },
      ).trim();
      const marker = process.env.MARKER;
      const body = `${marker}\n\`test.fixme\` count on \`main\` is **${out}** (budget: 7). Last updated by \`${context.workflow}\` run ${context.runId}.`;

      const issueNumber = 43;
      const existing = await github.paginate(github.rest.issues.listComments, {
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: issueNumber,
        per_page: 100,
      });
      const sticky = existing.find((c) => c.body && c.body.includes(marker));

      if (sticky) {
        await github.rest.issues.updateComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          comment_id: sticky.id,
          body,
        });
      } else {
        await github.rest.issues.createComment({
          owner: context.repo.owner,
          repo: context.repo.repo,
          issue_number: issueNumber,
          body,
        });
      }
```

- [ ] **Step 2: Verify YAML parses**

Run: `npx js-yaml .github/workflows/e2e-playwright.yml > /dev/null`
Expected: no syntax error.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/e2e-playwright.yml
git commit -m "ci: #53 sticky-update fixme count on tracking issue #43"
```

---

## Work Unit 4 — Playwright `chromium-mobile` project

**Files:**

- Modify: `e2e/playwright.config.ts`
- Modify: `e2e/specs/_journey.spec.ts`

### Task 4.1: Verify webServer placement, then add the project + tag the journey

- [ ] **Step 1: Verify `webServer` is top-level**

Run: `grep -n "webServer" e2e/playwright.config.ts`
Expected: a single `webServer:` at top-level indentation in the `defineConfig({...})`. (Pre-verified at line 32.)

- [ ] **Step 2: Replace the `projects:` array** in `e2e/playwright.config.ts`:

```ts
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'] },
      // Mobile is opt-in: only specs whose title contains @mobile run here.
      // Today: just _journey.spec.ts > 'register a fresh account'. Add tags
      // sparingly to keep the mobile suite under the 10-min runtime budget
      // tracked in #43.
      grep: /@mobile\b/,
    },
  ],
```

- [ ] **Step 3: Tag the journey's first test** at `e2e/specs/_journey.spec.ts:27`:

Change:

```ts
  test('register a fresh account', { tag: '@no-reset' }, async ({ browser }) => {
```

To:

```ts
  test('register a fresh account @mobile', { tag: '@no-reset' }, async ({ browser }) => {
```

(Append ` @mobile` to the title string. Playwright's `grep:` matches against the test TITLE; the `tag:` option is for annotations.)

- [ ] **Step 4: Verify project filtering**

Run: `cd e2e && npx playwright test --project=chromium-mobile --list`
Expected: 1 spec listed (the journey's `register a fresh account @mobile`).

Run: `cd e2e && npx playwright test --project=chromium-desktop --list | grep -c "›"`
Expected: ≥130 (full suite).

- [ ] **Step 5: Commit**

```bash
git add e2e/playwright.config.ts e2e/specs/_journey.spec.ts
git commit -m "feat(e2e): #53 add chromium-mobile project (Pixel 5, @mobile journey smoke)"
```

---

## Work Unit 5 — `e2e/README.md` final pass

**Files:**

- Modify: `e2e/README.md`

`.gitignore` already covers `e2e/.auth/` (line 35).

### Task 5.1: "Out of Scope" section

- [ ] **Step 1: Append**

```markdown
## Out of Scope

- **WebKit (Safari) Playwright project** — permanently out of scope. Forge is
  Chromium-first; we do not have Safari-specific code paths and the marginal
  coverage does not justify the suite-runtime cost. If a Safari-specific bug is
  reported in the wild, file a focused regression spec under `e2e/specs/shell/`
  and tag it `@webkit`; only then revisit adding the project.
- **Firefox Playwright project** — same rationale.
- **Mobile beyond `@mobile`-tagged specs** — the `chromium-mobile` project runs
  only `register a fresh account` from the journey on a Pixel 5 device. Add
  `@mobile` tags sparingly when a mobile-specific surface needs coverage.
- **Visual regression / screenshot diffing** — `screenshot: only-on-failure`
  exists for debugging only.
- **MinIO bucket pruning between specs** — file uploads accumulate during a
  run; re-runs are idempotent against deterministic seed UUIDs.
```

- [ ] **Step 2: Commit**

```bash
git add e2e/README.md
git commit -m "docs(e2e): #53 out-of-scope (webkit permanent, mobile scope)"
```

### Task 5.2: Selection-vs-assertion worked example

- [ ] **Step 1: Insert as a top-level section**

````markdown
## Selection vs. assertion

The single most common bug pattern in this suite is conflating **what to find**
with **what to verify**. A locator that uses an attribute that's only true at
the moment of assertion is a selector that races itself.

**Bad — selects on a property the assertion is about to check:**

```ts
// "Find the button that is enabled, then assert it is enabled" — tautology.
// If the page hasn't finished rendering, the locator finds 0 nodes and the
// assertion times out with a confusing 'expected 1, found 0'.
await expect(page.locator('button[aria-pressed="true"]')).toBeVisible();
```

**Good — selects by stable identity, asserts the dynamic state:**

```ts
const subscribeButton = page.getByTestId('subscribe-btn');
await expect(subscribeButton).toHaveAttribute('aria-pressed', 'true');
```

**Rule:** locators select by identity (testid, role+name, semantic structure).
Assertions check state (text, attribute value, visibility, count). If your
locator string mentions the thing your assertion checks, refactor.
````

- [ ] **Step 2: Commit**

```bash
git add e2e/README.md
git commit -m "docs(e2e): #53 selection-vs-assertion worked example"
```

### Task 5.3: Sharded selector header template

- [ ] **Step 1: Insert below "Selection vs. assertion"**

````markdown
## Sharded selector files — header template

Selectors live in `e2e/fixtures/selectors/<feature>.ts` (one file per feature
folder). Every file MUST start with this header:

```ts
// e2e/fixtures/selectors/<feature>.ts
//
// Selectors for the <feature> feature. Imported by:
//   - e2e/specs/<feature>/*.spec.ts
//
// Convention: selectors return Locator | string.
//   - Use Locator for selectors that need .first() / .nth(n) / chained .filter().
//   - Use string for plain CSS / role-name selectors that callers pass to .locator().
//
// Owner: <team> (@<github-handle>)
// Last reviewed: YYYY-MM-DD
```

When you modify a selector file, bump the "Last reviewed" date.
````

- [ ] **Step 2: Commit**

```bash
git add e2e/README.md
git commit -m "docs(e2e): #53 sharded selector file header template"
```

### Task 5.4: Periodic `@no-reset` audit reminder

- [ ] **Step 1: Insert**

````markdown
## Periodic audit — `@no-reset` specs

A small number of specs use `@no-reset` to opt out of the per-worker DB reset.
Once a quarter, run:

```bash
npm run e2e -- --grep @no-reset
```

…and confirm each `@no-reset` spec still avoids mutating state. A spec that
silently grew a write path while keeping the tag will pollute other workers'
fixtures and cause cross-spec flakes. If you find one, drop the tag.
````

- [ ] **Step 2: Commit**

```bash
git add e2e/README.md
git commit -m "docs(e2e): #53 periodic @no-reset audit reminder"
```

### Task 5.5: Flake protocol

- [ ] **Step 1: Insert above "Out of Scope"**

```markdown
## Flake protocol

When a spec flakes:

1. **First flake on a PR**: the auto-flake-tracker (`.github/scripts/e2e-flake-tracker.ts`) posts a PR comment suggesting `test.fixme()` and links any existing tracking issue.
2. **Two consecutive failures on `main`**: detected by querying the previous main run's `playwright-report` artifact via the GitHub API. The tracker either creates a `flaky-e2e`-labeled tracking issue (per-spec) or comments on an umbrella issue if the spec matches `.github/known-flake-classes.json` (e.g., closed #75 was the umbrella for cross-worker reset contention before its fix).
3. **De-flake SLA**: once a `flaky-e2e` issue exists, the **on-call engineer** owns it. Target: fix or `test.fixme()` within 48 hours.
4. **Un-fixme'ing**: when un-`test.fixme()`-ing a spec, **run it first**. If it still fails, do NOT assume the gating fix was incomplete — diagnose whether a secondary unrelated bug was masked (cf. closed #65).
5. **Budget**: the workflow fails if `test.fixme(` count in `e2e/specs/` exceeds `E2E_FIXME_BUDGET` (default 7).

Dashboard: open issues with the `flaky-e2e` label — [`is:open label:flaky-e2e`](https://github.com/multiandrewlab/forge/issues?q=is%3Aopen+label%3Aflaky-e2e).
```

- [ ] **Step 2: Commit**

```bash
git add e2e/README.md
git commit -m "docs(e2e): #53 flake protocol (SLA, ownership, dashboard)"
```

### Task 5.6: Storage-state security note

- [ ] **Step 1: Insert (search for existing `storageState` content; append; if none, add new section)**

```markdown
## Storage state — security note

Per-worker storage-state files (`e2e/.auth/<user>.json`) contain the seeded
`refresh_token` cookie for the worker's user. Treat them as secrets:

- The fixture writes them with `mode: 0o600` so other local users can't read them.
- Never commit `e2e/.auth/`; it is in `.gitignore` (line 35).
- In CI, storage state is generated fresh per run and lives only in the runner's
  tmpdir (not in artifacts).
- Local developers: clear `e2e/.auth/` if you switch your seeded password.
```

- [ ] **Step 2: Commit**

```bash
git add e2e/README.md
git commit -m "docs(e2e): #53 storage-state security note (mode 0o600)"
```

---

## Work Unit 6 — Tracking issue #43 final-status comment template (in PR description)

This work unit produces no code. The PR description includes a fully-populated final-status template the merger pastes onto issue #43 after merge.

### Task 6.1: PR description template

- [ ] **Step 1: When opening the PR, include**

```markdown
Closes #53.

## Tracking issue #43 — closing comment (paste after merge)

Run after this PR merges:

\`\`\`bash
gh issue comment 43 --body "$(cat <<'EOF'
**E2E rollout — final status (sub-issues #44–#53 all shipped).**

| #   | Title                             | PR                    |
| --- | --------------------------------- | --------------------- |
| #44 | Server seams                      | (gh pr list --search) |
| #45 | E2E scaffolding + journey smoke   | ...                   |
| #46 | E2E auth                          | #61                   |
| #47 | E2E posts + revisions             | #68                   |
| #48 | E2E comments + voting + bookmarks | ...                   |
| #49 | E2E tags + search                 | ...                   |
| #50 | E2E playground + AI               | ...                   |
| #51 | E2E files                         | ...                   |
| #52 | E2E shell + accessibility         | #91                   |
| #53 | E2E polish                        | (this PR)             |

- Final spec count: \$(find e2e/specs -name '\*.spec.ts' | wc -l)
- Suite runtime: <fill from last green main run>
- Retro: <link or "no retro filed">
  EOF
  )"
  \`\`\`
```

The merger fills the gaps from `gh pr list --state merged --search "in:title in:#4[4-9]"` and pastes.

---

## Self-review checklist

**DoD coverage:**

- [x] Auto-flake post-step parses `playwright-report/results.json` — Tasks 1.2, 2.2
- [x] **Twice-consecutive failure looked up via GitHub API** — Tasks 1.4 (`fetchPreviousRunFailedSpecs`), 2.2
- [x] Issue create OR comment on existing — Tasks 1.3, 1.4
- [x] PR runs post `test.fixme()` suggestion — Task 1.3 (`pull_request` branch)
- [x] `flaky-e2e` label created — Task 2.1 (idempotent in workflow)
- [x] Fixme-budget guard fails on > budget — Task 3.1 (`exit 1`)
- [x] Multi-line `test.fixme(` handled — Task 3.1 (`grep -Pzro`) + automated regression test
- [x] #43 updated with current fixme count — Task 3.2 (sticky comment)
- [x] webkit / chromium-mobile decision — Tasks 4.1 + 5.1
- [x] Worked example of selection-vs-assertion — Task 5.2
- [x] Sharded selector header template — Task 5.3
- [x] Periodic-audit reminder — Task 5.4
- [x] Flake protocol — Task 5.5
- [x] Storage-state mode 0o600 — Task 5.6
- [x] #43 final status update — Task 6.1
- [x] Vitest gate still passes — Task 1.4 step 5
- [x] Bruno gate still passes — no new endpoints
- [x] Closes #53 — Task 6.1 PR description footer

**Burst workflow (`e2e-burst.yml`):**

- [x] Workflow inherits all new steps via reusable-workflow `uses:` — auto-flake / sticky-#43 correctly skip on `workflow_dispatch` event; fixme-budget runs on every iteration (correct).

**Iteration-3 reviewer findings — resolution map:**

- F1 (dynamic-import returns default-wrapped): RESOLVED by `.github/scripts/package.json` with `"type": "module"`. The `import('./...js')` invocation is no longer used (CLI is invoked as `npx tsx <path>`, not via dynamic import).
- F2 (`require` mixed with ESM): RESOLVED — top-level `import { readFileSync, writeFileSync } from 'node:fs'` only; no `require()` anywhere.
- C1 (DoD deviation: cache vs API): RESOLVED — back to GitHub API lookup per choice C.
- C2 (multi-line fixme regression test): RESOLVED — Task 3.1 step 2 adds an automated CI regression test against a fixture file.
- C3 (e2e-burst.yml unaddressed): RESOLVED — documented in Architecture and self-review checklist; no code change needed.
- S1, S2, S3, S4, S5 (over-engineering concerns): KNOWN TRADEOFFS of choice C. The user explicitly declined option B (inline `actions/github-script`), which would have addressed these.

---

## Manual smoke (post-implementation, pre-PR)

1. Push the branch to a draft PR.
2. Confirm `Ensure flaky-e2e label exists` prints either creation success or "already exists."
3. Confirm `Fixme-budget guard` prints `current test.fixme count: 6`.
4. Confirm `Fixme-budget regex regression test` prints `Multi-line regex test passed: 1 match in fixture`.
5. Confirm both `chromium-desktop` and `chromium-mobile` projects run (HTML report shows both).
6. Confirm `Auto-flake tracker` step runs and either no-ops or posts a single PR comment listing failed specs.
7. After merge to main: confirm `Auto-flake tracker` runs on the main push; confirm `Sticky-update tracking issue #43` either creates a new sticky or updates the existing one.
8. (Optional adversarial) Temporarily set `E2E_FIXME_BUDGET: '5'` in the workflow file, push, verify CI fails fast on the budget step, then revert.
