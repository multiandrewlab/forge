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
