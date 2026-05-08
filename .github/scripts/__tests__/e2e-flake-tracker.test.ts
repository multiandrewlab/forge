import { describe, it, expect, vi } from 'vitest';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  parseResults,
  decideAction,
  intersectByIdentity,
  runTracker,
  createGitHubClient,
  buildPreviousRunsUrl,
  buildArtifactsUrl,
  pickReportArtifact,
  type Action,
  type GitHubClient,
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
