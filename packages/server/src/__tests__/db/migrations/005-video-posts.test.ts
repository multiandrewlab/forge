import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

// SQL-shape contract for migration 005_video-posts.
//
// Why regex/file-shape (not live DB)?  The project's unit-test suite never connects
// to Postgres — query tests mock the pool, and CI's main "Lint, Test & Coverage"
// workflow runs `npm run test:coverage` against a sandbox with no database.  The
// cascade-contract.test.ts established the precedent: assert on the migration file
// contents, then trust the bruno-regression / e2e-playwright workflows (which DO
// spin up Postgres and run `migrate:up`) to catch SQL-level regressions.

const migrationsDir = fileURLToPath(new URL('../../../db/migrations', import.meta.url));
const filename = '005_video-posts.sql';
const sql = readFileSync(join(migrationsDir, filename), 'utf8');

const allMigrationsConcatenated = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n');

describe('migration 005_video-posts', () => {
  it('exists and ships in lexicographic order after 004', () => {
    const files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();
    const idx = files.indexOf(filename);
    expect(idx).toBeGreaterThan(-1);
    expect(files[idx - 1]?.startsWith('004_')).toBe(true);
  });

  it('extends posts_content_type_check to include video', () => {
    expect(sql).toMatch(/ALTER TABLE posts DROP CONSTRAINT posts_content_type_check/);
    expect(sql).toMatch(/posts_content_type_check[\s\S]*?'video'/);
    // Sanity: concatenation of all migrations leaves the video branch intact.
    expect(allMigrationsConcatenated).toMatch(/CHECK \(content_type IN[^)]*'video'[^)]*\)/);
  });

  it('adds post_revisions.video_cf_uid VARCHAR(64)', () => {
    expect(sql).toMatch(/ALTER TABLE post_revisions ADD COLUMN video_cf_uid VARCHAR\(64\)/i);
  });

  it('creates post_videos table with the pending_cf_uid CHECK constraint', () => {
    expect(sql).toMatch(/CREATE TABLE post_videos/);
    expect(sql).toMatch(
      /CONSTRAINT post_videos_pending_cf_uid_distinct\s+CHECK \(pending_cf_uid IS NULL OR pending_cf_uid <> cf_uid\)/,
    );
  });

  it('creates the reconciler partial index on (status, updated_at)', () => {
    expect(sql).toMatch(
      /CREATE INDEX post_videos_status_updated_at_idx[\s\S]*?ON post_videos \(status, updated_at\)[\s\S]*?WHERE status NOT IN \('ready',\s*'failed'\)/,
    );
  });

  it('creates post_video_ai_runs table with (post_id, created_at DESC) index', () => {
    expect(sql).toMatch(/CREATE TABLE post_video_ai_runs/);
    expect(sql).toMatch(
      /CREATE INDEX post_video_ai_runs_post_created_idx[\s\S]*?\(post_id, created_at DESC\)/,
    );
  });

  it('creates cf_stream_webhook_events table with cf_uid index for de-dup', () => {
    expect(sql).toMatch(/CREATE TABLE cf_stream_webhook_events/);
    expect(sql).toMatch(/event_id VARCHAR\(128\) PRIMARY KEY/);
    expect(sql).toMatch(/CREATE INDEX cf_stream_webhook_events_cf_uid_idx[\s\S]*?\(cf_uid\)/);
  });

  it('creates compute_post_search_vector(p_post_id UUID) helper', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION compute_post_search_vector\(p_post_id UUID\)[\s\S]*?RETURNS tsvector/,
    );
  });

  it('redefines update_search_vector to delegate to the helper', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION update_search_vector\(\)[\s\S]*?compute_post_search_vector\(NEW\.id\)/,
    );
  });

  it('creates post_videos_transcript_search_vector_refresh trigger via the helper', () => {
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION refresh_post_search_vector_from_transcript\(\)[\s\S]*?compute_post_search_vector\(NEW\.post_id\)/,
    );
    expect(sql).toMatch(
      /CREATE TRIGGER post_videos_transcript_search_vector_refresh[\s\S]*?AFTER UPDATE OF transcript ON post_videos[\s\S]*?WHEN \(OLD\.transcript IS DISTINCT FROM NEW\.transcript\)/,
    );
  });
});
