import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

/**
 * Audit-log spec-coverage check (WU10, subtask 10.3).
 *
 * Spec §14 enumerates 10 structured audit events. Each must be emitted somewhere
 * in the server source tree as a `event: '<name>'` literal inside a logger call.
 * This test walks `src/` and asserts every required event token is present.
 *
 * It guards against future drift: if a refactor accidentally drops a `logger.info`
 * call that was the only emission site for an event, this test fails before merge.
 * The actual call-site behaviour is covered by the per-feature tests
 * (video-pipeline.test.ts, video.test.ts, cf-stream-webhook.test.ts).
 */

const REQUIRED_EVENTS = [
  'video.uploaded',
  'video.replaced',
  'video.cancelled',
  'video.visibility.flipped',
  'video.visibility.drift-detected',
  'video.ai-extract',
  'video.ai-rerun.requested',
  'cf-stream.webhook.received',
  'cf-stream.webhook.rejected',
  'video.pipeline.deferred-error',
] as const;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// __tests__/services -> __tests__ -> src
const SRC_ROOT = join(__dirname, '..', '..');

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    // Skip the tests directory itself; we only want production source.
    if (entry === '__tests__') continue;
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      walk(full, acc);
    } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
      acc.push(full);
    }
  }
  return acc;
}

const allSourceFiles = walk(SRC_ROOT);
const allSourceText = allSourceFiles.map((f) => readFileSync(f, 'utf8')).join('\n');

describe('spec §14 audit-event coverage', () => {
  it.each(REQUIRED_EVENTS)('emits %s in src/', (eventName) => {
    // Look for event: '<name>' or event: "<name>" — both quote styles.
    const single = `event: '${eventName}'`;
    const double = `event: "${eventName}"`;
    const found = allSourceText.includes(single) || allSourceText.includes(double);
    expect(found, `expected event "${eventName}" to be emitted somewhere in src/`).toBe(true);
  });

  it('scans a non-empty source tree (sanity)', () => {
    expect(allSourceFiles.length).toBeGreaterThan(0);
    expect(allSourceText.length).toBeGreaterThan(1000);
  });
});
