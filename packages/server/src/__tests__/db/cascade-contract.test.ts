import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const migrationsDir = fileURLToPath(new URL('../../db/migrations', import.meta.url));
const migrationFiles = readdirSync(migrationsDir)
  .filter((f) => f.endsWith('.sql'))
  .sort();
const concatenatedSql = migrationFiles
  .map((f) => readFileSync(join(migrationsDir, f), 'utf8'))
  .join('\n');

const CASCADE_FKS: Array<{ child: string; parent: string; rule: 'CASCADE' | 'SET NULL' }> = [
  { child: 'posts.author_id', parent: 'users(id)', rule: 'CASCADE' },
  { child: 'post_revisions.post_id', parent: 'posts(id)', rule: 'CASCADE' },
  { child: 'post_files.post_id', parent: 'posts(id)', rule: 'CASCADE' },
  { child: 'post_files.revision_id', parent: 'post_revisions(id)', rule: 'CASCADE' },
  { child: 'post_tags.post_id', parent: 'posts(id)', rule: 'CASCADE' },
  { child: 'post_tags.tag_id', parent: 'tags(id)', rule: 'CASCADE' },
  { child: 'prompt_variables.post_id', parent: 'posts(id)', rule: 'CASCADE' },
  { child: 'bookmarks.user_id', parent: 'users(id)', rule: 'CASCADE' },
  { child: 'bookmarks.post_id', parent: 'posts(id)', rule: 'CASCADE' },
  { child: 'votes.user_id', parent: 'users(id)', rule: 'CASCADE' },
  { child: 'votes.post_id', parent: 'posts(id)', rule: 'CASCADE' },
  { child: 'user_tag_subscriptions.user_id', parent: 'users(id)', rule: 'CASCADE' },
  { child: 'user_tag_subscriptions.tag_id', parent: 'tags(id)', rule: 'CASCADE' },
  { child: 'comments.post_id', parent: 'posts(id)', rule: 'CASCADE' },
  { child: 'comments.parent_id', parent: 'comments(id)', rule: 'CASCADE' },
  { child: 'comments.author_id', parent: 'users(id)', rule: 'SET NULL' },
  { child: 'posts.forked_from_id', parent: 'posts(id)', rule: 'SET NULL' },
];

describe('FK ON DELETE contract (worker-scoped reset depends on these)', () => {
  for (const fk of CASCADE_FKS) {
    it(`${fk.child} REFERENCES ${fk.parent} ON DELETE ${fk.rule}`, () => {
      const colName = fk.child.split('.')[1];
      // Match: "<colName> ... REFERENCES <parent> ON DELETE <RULE>" — flexible whitespace,
      // optional NOT NULL / UUID / etc between column name and REFERENCES.
      const pattern = new RegExp(
        String.raw`\b${colName}\b[^,()]*?REFERENCES\s+${fk.parent.replace('(', '\\(').replace(')', '\\)')}\s+ON\s+DELETE\s+${fk.rule}`,
        'i',
      );
      expect(concatenatedSql).toMatch(pattern);
    });

    // ALTER CONSTRAINT override detection: scan each post-001 migration INDIVIDUALLY
    // for any clause that would change this FK's delete rule. We check per-file rather
    // than against a concatenation so that unrelated CASCADE clauses in one migration
    // don't false-positive on author_id mentions in another migration. An actual
    // override would be in a single migration file: `ALTER TABLE comments ALTER CONSTRAINT
    // comments_author_id_fkey ... ON DELETE CASCADE` — all in one file.
    it(`${fk.child} is not later overridden by ALTER CONSTRAINT to a different rule`, () => {
      const colName = fk.child.split('.')[1];
      const otherRule = fk.rule === 'CASCADE' ? 'SET NULL' : 'CASCADE';
      const overridePattern = new RegExp(
        String.raw`ALTER\s+(TABLE|CONSTRAINT)[\s\S]*?\b${colName}\b[\s\S]*?ON\s+DELETE\s+${otherRule}`,
        'i',
      );
      for (const f of migrationFiles) {
        if (f.startsWith('001_')) continue;
        const content = readFileSync(join(migrationsDir, f), 'utf8');
        expect(content, `migration ${f}`).not.toMatch(overridePattern);
      }
    });
  }
});
