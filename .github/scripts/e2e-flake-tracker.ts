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
          `Auto-flake: ${spec.file} > ${spec.title} failed on two consecutive main runs.`,
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
