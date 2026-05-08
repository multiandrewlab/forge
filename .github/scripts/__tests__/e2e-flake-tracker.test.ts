import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseResults,
  decideAction,
  intersectByIdentity,
  type Action,
} from '../e2e-flake-tracker.js';

// Under "type": "module" ESM, __filename is not a global. Derive it from import.meta.url
// so the "malformed JSON" test below can point at a real on-disk file that isn't valid JSON.
const __filename = fileURLToPath(import.meta.url);

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
