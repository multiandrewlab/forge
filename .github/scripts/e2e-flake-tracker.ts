import { readFileSync } from 'node:fs';

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
