# Database Schema & Migrations Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create all database tables, triggers, indexes, text search config, typed query helpers, and seed data for the Forge application using node-pg-migrate.

**Architecture:** SQL migrations managed by node-pg-migrate CLI. PostgreSQL connection pool via `pg` with a typed query wrapper. Row-level type interfaces (snake_case matching DB columns) in a shared types file. Per-table query modules export basic CRUD functions. Tests mock the `pg` pool for unit testing; integration verified against Docker PostgreSQL.

**Tech Stack:** PostgreSQL 16, node-pg-migrate, pg, TypeScript (NodeNext), Vitest

**GitHub Issue:** #14 — [2/19] Database schema & migrations

---

## File Structure

### Create:

- `packages/server/src/db/connection.ts` — PG pool singleton + typed query helper
- `packages/server/src/db/migrations/001_initial-schema.sql` — Full schema (up + down)
- `packages/server/src/db/queries/types.ts` — Row type interfaces for all tables
- `packages/server/src/db/queries/users.ts` — User query helpers
- `packages/server/src/db/queries/posts.ts` — Post query helpers
- `packages/server/src/db/queries/revisions.ts` — Revision query helpers
- `packages/server/src/db/queries/tags.ts` — Tag + post_tags query helpers
- `packages/server/src/db/queries/comments.ts` — Comment query helpers
- `packages/server/src/db/queries/votes.ts` — Vote query helpers
- `packages/server/src/db/queries/bookmarks.ts` — Bookmark query helpers
- `packages/server/src/db/queries/post-files.ts` — Post file query helpers
- `packages/server/src/db/queries/prompt-variables.ts` — Prompt variable query helpers
- `packages/server/src/db/queries/index.ts` — Re-exports
- `scripts/seed.sql` — Sample data (3 users, 10+ posts, tags, comments, votes)
- `packages/server/src/__tests__/db/connection.test.ts`
- `packages/server/src/__tests__/db/queries/users.test.ts`
- `packages/server/src/__tests__/db/queries/posts.test.ts`
- `packages/server/src/__tests__/db/queries/revisions.test.ts`
- `packages/server/src/__tests__/db/queries/tags.test.ts`
- `packages/server/src/__tests__/db/queries/comments.test.ts`
- `packages/server/src/__tests__/db/queries/votes.test.ts`
- `packages/server/src/__tests__/db/queries/bookmarks.test.ts`
- `packages/server/src/__tests__/db/queries/post-files.test.ts`
- `packages/server/src/__tests__/db/queries/prompt-variables.test.ts`

### Modify:

- `packages/server/package.json` — Add pg, node-pg-migrate deps + migrate/seed scripts

---

## Task 1: Install Dependencies & Add npm Scripts

**Files:**

- Modify: `packages/server/package.json`

- [ ] **Step 1: Install pg and node-pg-migrate**

```bash
cd packages/server && npm install pg node-pg-migrate && npm install -D @types/pg
```

- [ ] **Step 2: Add migration and seed scripts to package.json**

Add these scripts to `packages/server/package.json`:

```json
{
  "scripts": {
    "migrate:up": "node-pg-migrate up --migrations-dir src/db/migrations",
    "migrate:down": "node-pg-migrate down --migrations-dir src/db/migrations",
    "migrate:create": "node-pg-migrate create --migrations-dir src/db/migrations --migration-file-language sql",
    "seed": "psql $DATABASE_URL -f ../../scripts/seed.sql"
  }
}
```

Note: node-pg-migrate reads `DATABASE_URL` env var by default. The `--migration-file-language sql` flag is only valid with the `create` action.

- [ ] **Step 3: Commit**

```bash
git add packages/server/package.json package-lock.json
git commit -m "feat(server): add pg, node-pg-migrate dependencies and migration scripts"
```

---

## Task 2: DB Connection Module (TDD)

**Files:**

- Create: `packages/server/src/__tests__/db/connection.test.ts`
- Create: `packages/server/src/db/connection.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/server/src/__tests__/db/connection.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

// Mock pg before importing connection module
vi.mock('pg', () => {
  const mockQuery = vi.fn();
  const mockEnd = vi.fn();
  const MockPool = vi.fn(() => ({
    query: mockQuery,
    end: mockEnd,
  }));
  return { default: { Pool: MockPool }, Pool: MockPool };
});

// Must import after mock setup
import pg from 'pg';
import { getPool, closePool, query } from '../../db/connection.js';

const MockPool = pg.Pool as unknown as Mock;

describe('connection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the module-level pool by closing it
    closePool();
  });

  describe('getPool', () => {
    it('creates a pool with DATABASE_URL when set', () => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
      const pool = getPool();
      expect(MockPool).toHaveBeenCalledWith({
        connectionString: 'postgresql://test:test@localhost:5432/testdb',
      });
      expect(pool).toBeDefined();
      delete process.env.DATABASE_URL;
    });

    it('creates a pool with default connection string when DATABASE_URL not set', () => {
      delete process.env.DATABASE_URL;
      const pool = getPool();
      expect(MockPool).toHaveBeenCalledWith({
        connectionString: 'postgresql://forge:forge_dev@localhost:5432/forge',
      });
      expect(pool).toBeDefined();
    });

    it('returns the same pool instance on subsequent calls', () => {
      const pool1 = getPool();
      const pool2 = getPool();
      expect(pool1).toBe(pool2);
      expect(MockPool).toHaveBeenCalledTimes(1);
    });
  });

  describe('closePool', () => {
    it('ends the pool and resets it', async () => {
      const pool = getPool();
      await closePool();
      expect(pool.end).toHaveBeenCalled();
    });

    it('does nothing when no pool exists', async () => {
      // closePool was already called in beforeEach, so pool is null
      await closePool(); // should not throw
    });
  });

  describe('query', () => {
    it('delegates to pool.query with text and params', async () => {
      const pool = getPool();
      const mockResult = { rows: [{ id: '1' }], rowCount: 1 };
      (pool.query as Mock).mockResolvedValue(mockResult);

      const result = await query('SELECT * FROM users WHERE id = $1', ['1']);

      expect(pool.query).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', ['1']);
      expect(result).toEqual(mockResult);
    });

    it('delegates to pool.query with text only', async () => {
      const pool = getPool();
      const mockResult = { rows: [], rowCount: 0 };
      (pool.query as Mock).mockResolvedValue(mockResult);

      const result = await query('SELECT 1');

      expect(pool.query).toHaveBeenCalledWith('SELECT 1', undefined);
      expect(result).toEqual(mockResult);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/andrew/Code/forge && npx vitest run packages/server/src/__tests__/db/connection.test.ts
```

Expected: FAIL — module `../../db/connection.js` not found.

- [ ] **Step 3: Write the implementation**

Create `packages/server/src/db/connection.ts`:

```typescript
import pg from 'pg';

const { Pool } = pg;

export type DbPool = pg.Pool;

let pool: DbPool | null = null;

export function getPool(): DbPool {
  if (!pool) {
    pool = new Pool({
      connectionString:
        process.env.DATABASE_URL ?? 'postgresql://forge:forge_dev@localhost:5432/forge',
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function query<T extends pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/andrew/Code/forge && npx vitest run packages/server/src/__tests__/db/connection.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/connection.ts packages/server/src/__tests__/db/connection.test.ts
git commit -m "feat(server): add database connection pool module with typed query helper"
```

---

## Task 3: Migration SQL — Schema Up

**Files:**

- Create: `packages/server/src/db/migrations/001_initial-schema.sql`

This is the largest single file. It contains all tables, triggers, indexes, and text search config.

- [ ] **Step 1: Create the migration file with Up Migration**

Create `packages/server/src/db/migrations/001_initial-schema.sql`:

```sql
-- Up Migration

-- Extensions (idempotent — may already exist from docker init)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Custom text search configuration
CREATE TEXT SEARCH CONFIGURATION forge_search (COPY = english);
ALTER TEXT SEARCH CONFIGURATION forge_search
  ALTER MAPPING FOR word, asciiword WITH unaccent, english_stem;

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email VARCHAR(255) UNIQUE NOT NULL,
  display_name VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(512),
  auth_provider VARCHAR(20) NOT NULL CHECK (auth_provider IN ('google', 'local')),
  password_hash VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Posts
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  content_type VARCHAR(20) NOT NULL CHECK (content_type IN ('snippet', 'prompt', 'document', 'link')),
  language VARCHAR(50),
  visibility VARCHAR(10) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  is_draft BOOLEAN NOT NULL DEFAULT true,
  forked_from_id UUID REFERENCES posts(id) ON DELETE SET NULL,
  link_url VARCHAR(2048),
  link_preview JSONB,
  vote_count INT NOT NULL DEFAULT 0,
  view_count INT NOT NULL DEFAULT 0,
  search_vector tsvector,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Post Revisions
CREATE TABLE post_revisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  content TEXT NOT NULL,
  message VARCHAR(500),
  revision_number INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(post_id, revision_number)
);

-- Post Files
CREATE TABLE post_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  revision_id UUID NOT NULL REFERENCES post_revisions(id) ON DELETE CASCADE,
  filename VARCHAR(255) NOT NULL,
  content TEXT,
  storage_key VARCHAR(512),
  mime_type VARCHAR(100),
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT file_size CHECK (octet_length(content) <= 10485760)
);

-- Tags
CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  post_count INT NOT NULL DEFAULT 0
);

-- Post Tags (join table)
CREATE TABLE post_tags (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

-- Votes
CREATE TABLE votes (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  value SMALLINT NOT NULL CHECK (value IN (1, -1)),
  PRIMARY KEY (user_id, post_id)
);

-- Bookmarks
CREATE TABLE bookmarks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

-- Tag Subscriptions
CREATE TABLE user_tag_subscriptions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, tag_id)
);

-- Comments
CREATE TABLE comments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
  line_number INT,
  revision_id UUID REFERENCES post_revisions(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prompt Variables
CREATE TABLE prompt_variables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  placeholder VARCHAR(500),
  sort_order INT NOT NULL DEFAULT 0,
  default_value TEXT,
  UNIQUE(post_id, name)
);

-- =============================================================
-- INDEXES
-- =============================================================

CREATE INDEX idx_revisions_post_rev_desc ON post_revisions(post_id, revision_number DESC);
CREATE INDEX idx_posts_search_vector ON posts USING GIN (search_vector);
CREATE INDEX idx_posts_title_trgm ON posts USING GIN (title gin_trgm_ops);
CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_post_files_revision_id ON post_files(revision_id);

-- =============================================================
-- TRIGGERS
-- =============================================================

-- 1. search_vector trigger: builds weighted tsvector on post insert/update
CREATE OR REPLACE FUNCTION update_search_vector() RETURNS TRIGGER AS $$
DECLARE
  latest_content TEXT;
  tag_names TEXT;
BEGIN
  SELECT content INTO latest_content
  FROM post_revisions
  WHERE post_id = NEW.id
  ORDER BY revision_number DESC
  LIMIT 1;

  SELECT string_agg(t.name, ' ') INTO tag_names
  FROM post_tags pt
  JOIN tags t ON t.id = pt.tag_id
  WHERE pt.post_id = NEW.id;

  NEW.search_vector :=
    setweight(to_tsvector('forge_search', coalesce(NEW.title, '')), 'A') ||
    setweight(to_tsvector('forge_search', coalesce(latest_content, '')), 'B') ||
    setweight(to_tsvector('forge_search', coalesce(tag_names, '')), 'C');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_search_vector_trigger
  BEFORE INSERT OR UPDATE ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_search_vector();

-- 2. vote_count trigger: increments/decrements on vote insert/update/delete
CREATE OR REPLACE FUNCTION update_vote_count() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE posts SET vote_count = vote_count + NEW.value WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE posts SET vote_count = vote_count - OLD.value WHERE id = OLD.post_id;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    UPDATE posts SET vote_count = vote_count - OLD.value + NEW.value WHERE id = NEW.post_id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER votes_count_trigger
  AFTER INSERT OR UPDATE OR DELETE ON votes
  FOR EACH ROW
  EXECUTE FUNCTION update_vote_count();

-- 3. tag post_count trigger: counts only public, non-draft, non-deleted posts
CREATE OR REPLACE FUNCTION update_tag_post_count() RETURNS TRIGGER AS $$
DECLARE
  should_count BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT (deleted_at IS NULL AND visibility = 'public' AND is_draft = false)
    INTO should_count
    FROM posts WHERE id = NEW.post_id;

    IF should_count THEN
      UPDATE tags SET post_count = post_count + 1 WHERE id = NEW.tag_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    SELECT (deleted_at IS NULL AND visibility = 'public' AND is_draft = false)
    INTO should_count
    FROM posts WHERE id = OLD.post_id;

    IF should_count THEN
      UPDATE tags SET post_count = post_count - 1 WHERE id = OLD.tag_id;
    END IF;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tag_post_count_trigger
  AFTER INSERT OR DELETE ON post_tags
  FOR EACH ROW
  EXECUTE FUNCTION update_tag_post_count();

-- 3b. tag post_count trigger on post state changes (soft-delete, visibility, draft status)
CREATE OR REPLACE FUNCTION update_tag_post_count_on_post_change() RETURNS TRIGGER AS $$
DECLARE
  old_qualifies BOOLEAN;
  new_qualifies BOOLEAN;
BEGIN
  old_qualifies := (OLD.deleted_at IS NULL AND OLD.visibility = 'public' AND OLD.is_draft = false);
  new_qualifies := (NEW.deleted_at IS NULL AND NEW.visibility = 'public' AND NEW.is_draft = false);

  IF old_qualifies AND NOT new_qualifies THEN
    UPDATE tags SET post_count = post_count - 1
    WHERE id IN (SELECT tag_id FROM post_tags WHERE post_id = NEW.id);
  ELSIF NOT old_qualifies AND new_qualifies THEN
    UPDATE tags SET post_count = post_count + 1
    WHERE id IN (SELECT tag_id FROM post_tags WHERE post_id = NEW.id);
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER posts_tag_count_trigger
  AFTER UPDATE OF deleted_at, visibility, is_draft ON posts
  FOR EACH ROW
  EXECUTE FUNCTION update_tag_post_count_on_post_change();

-- 4. Refresh search_vector when revisions or tags change
CREATE OR REPLACE FUNCTION refresh_post_search_vector() RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    UPDATE posts SET updated_at = NOW() WHERE id = OLD.post_id;
    RETURN OLD;
  ELSE
    UPDATE posts SET updated_at = NOW() WHERE id = NEW.post_id;
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER revisions_refresh_search_vector
  AFTER INSERT OR UPDATE ON post_revisions
  FOR EACH ROW
  EXECUTE FUNCTION refresh_post_search_vector();

CREATE TRIGGER post_tags_refresh_search_vector
  AFTER INSERT OR DELETE ON post_tags
  FOR EACH ROW
  EXECUTE FUNCTION refresh_post_search_vector();

-- Down Migration

DROP TRIGGER IF EXISTS post_tags_refresh_search_vector ON post_tags;
DROP TRIGGER IF EXISTS revisions_refresh_search_vector ON post_revisions;
DROP FUNCTION IF EXISTS refresh_post_search_vector();
DROP TRIGGER IF EXISTS posts_tag_count_trigger ON posts;
DROP FUNCTION IF EXISTS update_tag_post_count_on_post_change();
DROP TRIGGER IF EXISTS tag_post_count_trigger ON post_tags;
DROP FUNCTION IF EXISTS update_tag_post_count();
DROP TRIGGER IF EXISTS votes_count_trigger ON votes;
DROP FUNCTION IF EXISTS update_vote_count();
DROP TRIGGER IF EXISTS posts_search_vector_trigger ON posts;
DROP FUNCTION IF EXISTS update_search_vector();

DROP TABLE IF EXISTS prompt_variables;
DROP TABLE IF EXISTS comments;
DROP TABLE IF EXISTS user_tag_subscriptions;
DROP TABLE IF EXISTS bookmarks;
DROP TABLE IF EXISTS votes;
DROP TABLE IF EXISTS post_tags;
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS post_files;
DROP TABLE IF EXISTS post_revisions;
DROP TABLE IF EXISTS posts;
DROP TABLE IF EXISTS users;

DROP TEXT SEARCH CONFIGURATION IF EXISTS forge_search;

DROP EXTENSION IF EXISTS "unaccent";
DROP EXTENSION IF EXISTS "pg_trgm";
DROP EXTENSION IF EXISTS "uuid-ossp";
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/db/migrations/001_initial-schema.sql
git commit -m "feat(server): add initial database schema migration with all tables, triggers, and indexes"
```

---

## Task 4: Row Type Definitions

**Files:**

- Create: `packages/server/src/db/queries/types.ts`

These are TypeScript interfaces matching the SQL column names (snake_case). The service layer (future issues) maps these to the camelCase types in `@forge/shared`.

- [ ] **Step 1: Create row type definitions**

Create `packages/server/src/db/queries/types.ts`:

```typescript
export interface UserRow {
  id: string;
  email: string;
  display_name: string;
  avatar_url: string | null;
  auth_provider: string;
  password_hash: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface PostRow {
  id: string;
  author_id: string;
  title: string;
  content_type: string;
  language: string | null;
  visibility: string;
  is_draft: boolean;
  forked_from_id: string | null;
  link_url: string | null;
  link_preview: Record<string, unknown> | null;
  vote_count: number;
  view_count: number;
  search_vector: string | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface PostRevisionRow {
  id: string;
  post_id: string;
  author_id: string | null;
  content: string;
  message: string | null;
  revision_number: number;
  created_at: Date;
}

export interface PostFileRow {
  id: string;
  post_id: string;
  revision_id: string;
  filename: string;
  content: string | null;
  storage_key: string | null;
  mime_type: string | null;
  sort_order: number;
  created_at: Date;
}

export interface TagRow {
  id: string;
  name: string;
  post_count: number;
}

export interface PostTagRow {
  post_id: string;
  tag_id: string;
}

export interface VoteRow {
  user_id: string;
  post_id: string;
  value: number;
}

export interface BookmarkRow {
  user_id: string;
  post_id: string;
  created_at: Date;
}

export interface UserTagSubscriptionRow {
  user_id: string;
  tag_id: string;
}

export interface CommentRow {
  id: string;
  post_id: string;
  author_id: string | null;
  parent_id: string | null;
  line_number: number | null;
  revision_id: string | null;
  body: string;
  created_at: Date;
  updated_at: Date;
}

export interface PromptVariableRow {
  id: string;
  post_id: string;
  name: string;
  placeholder: string | null;
  sort_order: number;
  default_value: string | null;
}
```

- [ ] **Step 2: Verify types compile**

```bash
cd /Users/andrew/Code/forge && npx tsc --noEmit -p packages/server/tsconfig.json
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add packages/server/src/db/queries/types.ts
git commit -m "feat(server): add row type definitions for all database tables"
```

---

## Task 5: Query Helpers — Users & Posts (TDD)

**Files:**

- Create: `packages/server/src/__tests__/db/queries/users.test.ts`
- Create: `packages/server/src/__tests__/db/queries/posts.test.ts`
- Create: `packages/server/src/db/queries/users.ts`
- Create: `packages/server/src/db/queries/posts.ts`

### Testing pattern (used by all query test files):

All query tests mock `../../db/connection.js` and verify:

1. Correct SQL text is passed
2. Correct params array is passed
3. Return value is properly extracted from result rows

---

- [ ] **Step 1: Write failing test for users**

Create `packages/server/src/__tests__/db/queries/users.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import { findUserById, findUserByEmail, createUser } from '../../../db/queries/users.js';
import type { UserRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleUser: UserRow = {
  id: '550e8400-e29b-41d4-a716-446655440000',
  email: 'alice@example.com',
  display_name: 'Alice',
  avatar_url: null,
  auth_provider: 'local',
  password_hash: '$2b$12$hash',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

describe('user queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('findUserById', () => {
    it('returns the user when found', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleUser], rowCount: 1 });
      const result = await findUserById(sampleUser.id);
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE id = $1', [sampleUser.id]);
      expect(result).toEqual(sampleUser);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findUserById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('findUserByEmail', () => {
    it('returns the user when found', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleUser], rowCount: 1 });
      const result = await findUserByEmail(sampleUser.email);
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM users WHERE email = $1', [
        sampleUser.email,
      ]);
      expect(result).toEqual(sampleUser);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findUserByEmail('nobody@example.com');
      expect(result).toBeNull();
    });
  });

  describe('createUser', () => {
    it('inserts a user and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleUser], rowCount: 1 });
      const result = await createUser({
        email: 'alice@example.com',
        displayName: 'Alice',
        avatarUrl: null,
        authProvider: 'local',
        passwordHash: '$2b$12$hash',
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO users (email, display_name, avatar_url, auth_provider, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        ['alice@example.com', 'Alice', null, 'local', '$2b$12$hash'],
      );
      expect(result).toEqual(sampleUser);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd /Users/andrew/Code/forge && npx vitest run packages/server/src/__tests__/db/queries/users.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement users.ts**

Create `packages/server/src/db/queries/users.ts`:

```typescript
import { query } from '../connection.js';
import type { UserRow } from './types.js';

export async function findUserById(id: string): Promise<UserRow | null> {
  const result = await query<UserRow>('SELECT * FROM users WHERE id = $1', [id]);
  return result.rows[0] ?? null;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const result = await query<UserRow>('SELECT * FROM users WHERE email = $1', [email]);
  return result.rows[0] ?? null;
}

export interface CreateUserInput {
  email: string;
  displayName: string;
  avatarUrl: string | null;
  authProvider: string;
  passwordHash: string | null;
}

export async function createUser(input: CreateUserInput): Promise<UserRow> {
  const result = await query<UserRow>(
    `INSERT INTO users (email, display_name, avatar_url, auth_provider, password_hash) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.email, input.displayName, input.avatarUrl, input.authProvider, input.passwordHash],
  );
  return result.rows[0]!;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
cd /Users/andrew/Code/forge && npx vitest run packages/server/src/__tests__/db/queries/users.test.ts
```

Expected: ALL PASS

- [ ] **Step 5: Write failing test for posts**

Create `packages/server/src/__tests__/db/queries/posts.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import { findPostById, createPost } from '../../../db/queries/posts.js';
import type { PostRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const samplePost: PostRow = {
  id: '660e8400-e29b-41d4-a716-446655440000',
  author_id: '550e8400-e29b-41d4-a716-446655440000',
  title: 'Test Post',
  content_type: 'snippet',
  language: 'typescript',
  visibility: 'public',
  is_draft: false,
  forked_from_id: null,
  link_url: null,
  link_preview: null,
  vote_count: 0,
  view_count: 0,
  search_vector: null,
  deleted_at: null,
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

describe('post queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('findPostById', () => {
    it('returns the post when found and not deleted', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePost], rowCount: 1 });
      const result = await findPostById(samplePost.id);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM posts WHERE id = $1 AND deleted_at IS NULL',
        [samplePost.id],
      );
      expect(result).toEqual(samplePost);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findPostById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createPost', () => {
    it('inserts a post and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [samplePost], rowCount: 1 });
      const result = await createPost({
        authorId: samplePost.author_id,
        title: 'Test Post',
        contentType: 'snippet',
        language: 'typescript',
        visibility: 'public',
        isDraft: false,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO posts (author_id, title, content_type, language, visibility, is_draft) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [samplePost.author_id, 'Test Post', 'snippet', 'typescript', 'public', false],
      );
      expect(result).toEqual(samplePost);
    });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

```bash
cd /Users/andrew/Code/forge && npx vitest run packages/server/src/__tests__/db/queries/posts.test.ts
```

Expected: FAIL

- [ ] **Step 7: Implement posts.ts**

Create `packages/server/src/db/queries/posts.ts`:

```typescript
import { query } from '../connection.js';
import type { PostRow } from './types.js';

export async function findPostById(id: string): Promise<PostRow | null> {
  const result = await query<PostRow>('SELECT * FROM posts WHERE id = $1 AND deleted_at IS NULL', [
    id,
  ]);
  return result.rows[0] ?? null;
}

export interface CreatePostInput {
  authorId: string;
  title: string;
  contentType: string;
  language: string | null;
  visibility: string;
  isDraft: boolean;
}

export async function createPost(input: CreatePostInput): Promise<PostRow> {
  const result = await query<PostRow>(
    `INSERT INTO posts (author_id, title, content_type, language, visibility, is_draft) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [
      input.authorId,
      input.title,
      input.contentType,
      input.language,
      input.visibility,
      input.isDraft,
    ],
  );
  return result.rows[0]!;
}
```

- [ ] **Step 8: Run tests to verify all pass**

```bash
cd /Users/andrew/Code/forge && npx vitest run packages/server/src/__tests__/db/queries/
```

Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/db/queries/users.ts packages/server/src/db/queries/posts.ts \
  packages/server/src/__tests__/db/queries/users.test.ts packages/server/src/__tests__/db/queries/posts.test.ts
git commit -m "feat(server): add typed query helpers for users and posts"
```

---

## Task 6: Query Helpers — Revisions & Tags (TDD)

**Files:**

- Create: `packages/server/src/__tests__/db/queries/revisions.test.ts`
- Create: `packages/server/src/__tests__/db/queries/tags.test.ts`
- Create: `packages/server/src/db/queries/revisions.ts`
- Create: `packages/server/src/db/queries/tags.ts`

- [ ] **Step 1: Write failing test for revisions**

Create `packages/server/src/__tests__/db/queries/revisions.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import {
  findRevisionsByPostId,
  findRevision,
  createRevision,
} from '../../../db/queries/revisions.js';
import type { PostRevisionRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleRevision: PostRevisionRow = {
  id: '770e8400-e29b-41d4-a716-446655440000',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  author_id: '550e8400-e29b-41d4-a716-446655440000',
  content: '# Hello World',
  message: 'Initial version',
  revision_number: 1,
  created_at: new Date('2026-01-01'),
};

describe('revision queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('findRevisionsByPostId', () => {
    it('returns revisions ordered by revision_number desc', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleRevision], rowCount: 1 });
      const result = await findRevisionsByPostId(sampleRevision.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM post_revisions WHERE post_id = $1 ORDER BY revision_number DESC',
        [sampleRevision.post_id],
      );
      expect(result).toEqual([sampleRevision]);
    });
  });

  describe('findRevision', () => {
    it('returns a specific revision by post and number', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleRevision], rowCount: 1 });
      const result = await findRevision(sampleRevision.post_id, 1);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM post_revisions WHERE post_id = $1 AND revision_number = $2',
        [sampleRevision.post_id, 1],
      );
      expect(result).toEqual(sampleRevision);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findRevision('id', 999);
      expect(result).toBeNull();
    });
  });

  describe('createRevision', () => {
    it('inserts a revision and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleRevision], rowCount: 1 });
      const result = await createRevision({
        postId: sampleRevision.post_id,
        authorId: sampleRevision.author_id!,
        content: '# Hello World',
        message: 'Initial version',
        revisionNumber: 1,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO post_revisions (post_id, author_id, content, message, revision_number) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [sampleRevision.post_id, sampleRevision.author_id, '# Hello World', 'Initial version', 1],
      );
      expect(result).toEqual(sampleRevision);
    });
  });
});
```

- [ ] **Step 2: Write failing test for tags**

Create `packages/server/src/__tests__/db/queries/tags.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import { findTagByName, createTag, addPostTag, removePostTag } from '../../../db/queries/tags.js';
import type { TagRow, PostTagRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleTag: TagRow = {
  id: '880e8400-e29b-41d4-a716-446655440000',
  name: 'typescript',
  post_count: 5,
};

describe('tag queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('findTagByName', () => {
    it('returns the tag when found', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleTag], rowCount: 1 });
      const result = await findTagByName('typescript');
      expect(mockQuery).toHaveBeenCalledWith('SELECT * FROM tags WHERE name = $1', ['typescript']);
      expect(result).toEqual(sampleTag);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
      const result = await findTagByName('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('createTag', () => {
    it('inserts a tag and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleTag], rowCount: 1 });
      const result = await createTag('typescript');
      expect(mockQuery).toHaveBeenCalledWith('INSERT INTO tags (name) VALUES ($1) RETURNING *', [
        'typescript',
      ]);
      expect(result).toEqual(sampleTag);
    });
  });

  describe('addPostTag', () => {
    it('inserts a post_tag row', async () => {
      const row: PostTagRow = { post_id: 'post-1', tag_id: 'tag-1' };
      mockQuery.mockResolvedValue({ rows: [row], rowCount: 1 });
      const result = await addPostTag('post-1', 'tag-1');
      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
        ['post-1', 'tag-1'],
      );
      expect(result).toEqual(row);
    });
  });

  describe('removePostTag', () => {
    it('deletes a post_tag row and returns true when deleted', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      const result = await removePostTag('post-1', 'tag-1');
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM post_tags WHERE post_id = $1 AND tag_id = $2',
        ['post-1', 'tag-1'],
      );
      expect(result).toBe(true);
    });

    it('returns false when no row existed', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      const result = await removePostTag('post-1', 'tag-1');
      expect(result).toBe(false);
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /Users/andrew/Code/forge && npx vitest run packages/server/src/__tests__/db/queries/revisions.test.ts packages/server/src/__tests__/db/queries/tags.test.ts
```

Expected: FAIL

- [ ] **Step 4: Implement revisions.ts**

Create `packages/server/src/db/queries/revisions.ts`:

```typescript
import { query } from '../connection.js';
import type { PostRevisionRow } from './types.js';

export async function findRevisionsByPostId(postId: string): Promise<PostRevisionRow[]> {
  const result = await query<PostRevisionRow>(
    'SELECT * FROM post_revisions WHERE post_id = $1 ORDER BY revision_number DESC',
    [postId],
  );
  return result.rows;
}

export async function findRevision(
  postId: string,
  revisionNumber: number,
): Promise<PostRevisionRow | null> {
  const result = await query<PostRevisionRow>(
    'SELECT * FROM post_revisions WHERE post_id = $1 AND revision_number = $2',
    [postId, revisionNumber],
  );
  return result.rows[0] ?? null;
}

export interface CreateRevisionInput {
  postId: string;
  authorId: string;
  content: string;
  message: string | null;
  revisionNumber: number;
}

export async function createRevision(input: CreateRevisionInput): Promise<PostRevisionRow> {
  const result = await query<PostRevisionRow>(
    `INSERT INTO post_revisions (post_id, author_id, content, message, revision_number) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.postId, input.authorId, input.content, input.message, input.revisionNumber],
  );
  return result.rows[0]!;
}
```

- [ ] **Step 5: Implement tags.ts**

Create `packages/server/src/db/queries/tags.ts`:

```typescript
import { query } from '../connection.js';
import type { TagRow, PostTagRow } from './types.js';

export async function findTagByName(name: string): Promise<TagRow | null> {
  const result = await query<TagRow>('SELECT * FROM tags WHERE name = $1', [name]);
  return result.rows[0] ?? null;
}

export async function createTag(name: string): Promise<TagRow> {
  const result = await query<TagRow>('INSERT INTO tags (name) VALUES ($1) RETURNING *', [name]);
  return result.rows[0]!;
}

export async function addPostTag(postId: string, tagId: string): Promise<PostTagRow | null> {
  const result = await query<PostTagRow>(
    'INSERT INTO post_tags (post_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
    [postId, tagId],
  );
  return result.rows[0] ?? null;
}

export async function removePostTag(postId: string, tagId: string): Promise<boolean> {
  const result = await query('DELETE FROM post_tags WHERE post_id = $1 AND tag_id = $2', [
    postId,
    tagId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
```

- [ ] **Step 6: Run tests to verify all pass**

```bash
cd /Users/andrew/Code/forge && npx vitest run packages/server/src/__tests__/db/queries/
```

Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add packages/server/src/db/queries/revisions.ts packages/server/src/db/queries/tags.ts \
  packages/server/src/__tests__/db/queries/revisions.test.ts packages/server/src/__tests__/db/queries/tags.test.ts
git commit -m "feat(server): add typed query helpers for revisions and tags"
```

---

## Task 7: Query Helpers — Comments, Votes, Bookmarks (TDD)

**Files:**

- Create: `packages/server/src/__tests__/db/queries/comments.test.ts`
- Create: `packages/server/src/__tests__/db/queries/votes.test.ts`
- Create: `packages/server/src/__tests__/db/queries/bookmarks.test.ts`
- Create: `packages/server/src/db/queries/comments.ts`
- Create: `packages/server/src/db/queries/votes.ts`
- Create: `packages/server/src/db/queries/bookmarks.ts`

- [ ] **Step 1: Write failing test for comments**

Create `packages/server/src/__tests__/db/queries/comments.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import { findCommentsByPostId, createComment } from '../../../db/queries/comments.js';
import type { CommentRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleComment: CommentRow = {
  id: '990e8400-e29b-41d4-a716-446655440000',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  author_id: '550e8400-e29b-41d4-a716-446655440000',
  parent_id: null,
  line_number: null,
  revision_id: null,
  body: 'Great post!',
  created_at: new Date('2026-01-01'),
  updated_at: new Date('2026-01-01'),
};

describe('comment queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('findCommentsByPostId', () => {
    it('returns comments ordered by created_at', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleComment], rowCount: 1 });
      const result = await findCommentsByPostId(sampleComment.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC',
        [sampleComment.post_id],
      );
      expect(result).toEqual([sampleComment]);
    });
  });

  describe('createComment', () => {
    it('inserts a comment and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleComment], rowCount: 1 });
      const result = await createComment({
        postId: sampleComment.post_id,
        authorId: sampleComment.author_id!,
        parentId: null,
        lineNumber: null,
        revisionId: null,
        body: 'Great post!',
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO comments (post_id, author_id, parent_id, line_number, revision_id, body) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [sampleComment.post_id, sampleComment.author_id, null, null, null, 'Great post!'],
      );
      expect(result).toEqual(sampleComment);
    });
  });
});
```

- [ ] **Step 2: Write failing test for votes**

Create `packages/server/src/__tests__/db/queries/votes.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import { upsertVote, deleteVote } from '../../../db/queries/votes.js';
import type { VoteRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleVote: VoteRow = {
  user_id: '550e8400-e29b-41d4-a716-446655440000',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  value: 1,
};

describe('vote queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('upsertVote', () => {
    it('inserts or updates a vote and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleVote], rowCount: 1 });
      const result = await upsertVote(sampleVote.user_id, sampleVote.post_id, 1);
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO votes (user_id, post_id, value) VALUES ($1, $2, $3) ON CONFLICT (user_id, post_id) DO UPDATE SET value = EXCLUDED.value RETURNING *`,
        [sampleVote.user_id, sampleVote.post_id, 1],
      );
      expect(result).toEqual(sampleVote);
    });
  });

  describe('deleteVote', () => {
    it('deletes a vote and returns true when deleted', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      const result = await deleteVote(sampleVote.user_id, sampleVote.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM votes WHERE user_id = $1 AND post_id = $2',
        [sampleVote.user_id, sampleVote.post_id],
      );
      expect(result).toBe(true);
    });

    it('returns false when no vote existed', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      const result = await deleteVote('u1', 'p1');
      expect(result).toBe(false);
    });
  });
});
```

- [ ] **Step 3: Write failing test for bookmarks**

Create `packages/server/src/__tests__/db/queries/bookmarks.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import { createBookmark, deleteBookmark } from '../../../db/queries/bookmarks.js';
import type { BookmarkRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleBookmark: BookmarkRow = {
  user_id: '550e8400-e29b-41d4-a716-446655440000',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  created_at: new Date('2026-01-01'),
};

describe('bookmark queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('createBookmark', () => {
    it('inserts a bookmark and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleBookmark], rowCount: 1 });
      const result = await createBookmark(sampleBookmark.user_id, sampleBookmark.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
        [sampleBookmark.user_id, sampleBookmark.post_id],
      );
      expect(result).toEqual(sampleBookmark);
    });
  });

  describe('deleteBookmark', () => {
    it('deletes a bookmark and returns true when deleted', async () => {
      mockQuery.mockResolvedValue({ rowCount: 1 });
      const result = await deleteBookmark(sampleBookmark.user_id, sampleBookmark.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'DELETE FROM bookmarks WHERE user_id = $1 AND post_id = $2',
        [sampleBookmark.user_id, sampleBookmark.post_id],
      );
      expect(result).toBe(true);
    });

    it('returns false when no bookmark existed', async () => {
      mockQuery.mockResolvedValue({ rowCount: 0 });
      const result = await deleteBookmark('u1', 'p1');
      expect(result).toBe(false);
    });
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
cd /Users/andrew/Code/forge && npx vitest run packages/server/src/__tests__/db/queries/comments.test.ts packages/server/src/__tests__/db/queries/votes.test.ts packages/server/src/__tests__/db/queries/bookmarks.test.ts
```

Expected: FAIL

- [ ] **Step 5: Implement comments.ts**

Create `packages/server/src/db/queries/comments.ts`:

```typescript
import { query } from '../connection.js';
import type { CommentRow } from './types.js';

export async function findCommentsByPostId(postId: string): Promise<CommentRow[]> {
  const result = await query<CommentRow>(
    'SELECT * FROM comments WHERE post_id = $1 ORDER BY created_at ASC',
    [postId],
  );
  return result.rows;
}

export interface CreateCommentInput {
  postId: string;
  authorId: string;
  parentId: string | null;
  lineNumber: number | null;
  revisionId: string | null;
  body: string;
}

export async function createComment(input: CreateCommentInput): Promise<CommentRow> {
  const result = await query<CommentRow>(
    `INSERT INTO comments (post_id, author_id, parent_id, line_number, revision_id, body) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [input.postId, input.authorId, input.parentId, input.lineNumber, input.revisionId, input.body],
  );
  return result.rows[0]!;
}
```

- [ ] **Step 6: Implement votes.ts**

Create `packages/server/src/db/queries/votes.ts`:

```typescript
import { query } from '../connection.js';
import type { VoteRow } from './types.js';

export async function upsertVote(userId: string, postId: string, value: number): Promise<VoteRow> {
  const result = await query<VoteRow>(
    `INSERT INTO votes (user_id, post_id, value) VALUES ($1, $2, $3) ON CONFLICT (user_id, post_id) DO UPDATE SET value = EXCLUDED.value RETURNING *`,
    [userId, postId, value],
  );
  return result.rows[0]!;
}

export async function deleteVote(userId: string, postId: string): Promise<boolean> {
  const result = await query('DELETE FROM votes WHERE user_id = $1 AND post_id = $2', [
    userId,
    postId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
```

- [ ] **Step 7: Implement bookmarks.ts**

Create `packages/server/src/db/queries/bookmarks.ts`:

```typescript
import { query } from '../connection.js';
import type { BookmarkRow } from './types.js';

export async function createBookmark(userId: string, postId: string): Promise<BookmarkRow | null> {
  const result = await query<BookmarkRow>(
    'INSERT INTO bookmarks (user_id, post_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *',
    [userId, postId],
  );
  return result.rows[0] ?? null;
}

export async function deleteBookmark(userId: string, postId: string): Promise<boolean> {
  const result = await query('DELETE FROM bookmarks WHERE user_id = $1 AND post_id = $2', [
    userId,
    postId,
  ]);
  return (result.rowCount ?? 0) > 0;
}
```

- [ ] **Step 8: Run all query tests**

```bash
cd /Users/andrew/Code/forge && npx vitest run packages/server/src/__tests__/db/queries/
```

Expected: ALL PASS

- [ ] **Step 9: Commit**

```bash
git add packages/server/src/db/queries/comments.ts packages/server/src/db/queries/votes.ts \
  packages/server/src/db/queries/bookmarks.ts \
  packages/server/src/__tests__/db/queries/comments.test.ts \
  packages/server/src/__tests__/db/queries/votes.test.ts \
  packages/server/src/__tests__/db/queries/bookmarks.test.ts
git commit -m "feat(server): add typed query helpers for comments, votes, and bookmarks"
```

---

## Task 8: Query Helpers — Post Files & Prompt Variables (TDD)

**Files:**

- Create: `packages/server/src/__tests__/db/queries/post-files.test.ts`
- Create: `packages/server/src/__tests__/db/queries/prompt-variables.test.ts`
- Create: `packages/server/src/db/queries/post-files.ts`
- Create: `packages/server/src/db/queries/prompt-variables.ts`

- [ ] **Step 1: Write failing test for post-files**

Create `packages/server/src/__tests__/db/queries/post-files.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import { findFilesByRevisionId, createPostFile } from '../../../db/queries/post-files.js';
import type { PostFileRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleFile: PostFileRow = {
  id: 'ff000000-0000-0000-0000-000000000001',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  revision_id: '770e8400-e29b-41d4-a716-446655440000',
  filename: 'main.ts',
  content: 'console.log("hello")',
  storage_key: null,
  mime_type: 'text/typescript',
  sort_order: 0,
  created_at: new Date('2026-01-01'),
};

describe('post file queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('findFilesByRevisionId', () => {
    it('returns files ordered by sort_order', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleFile], rowCount: 1 });
      const result = await findFilesByRevisionId(sampleFile.revision_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM post_files WHERE revision_id = $1 ORDER BY sort_order ASC',
        [sampleFile.revision_id],
      );
      expect(result).toEqual([sampleFile]);
    });
  });

  describe('createPostFile', () => {
    it('inserts a file and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleFile], rowCount: 1 });
      const result = await createPostFile({
        postId: sampleFile.post_id,
        revisionId: sampleFile.revision_id,
        filename: 'main.ts',
        content: 'console.log("hello")',
        storageKey: null,
        mimeType: 'text/typescript',
        sortOrder: 0,
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO post_files (post_id, revision_id, filename, content, storage_key, mime_type, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [
          sampleFile.post_id,
          sampleFile.revision_id,
          'main.ts',
          'console.log("hello")',
          null,
          'text/typescript',
          0,
        ],
      );
      expect(result).toEqual(sampleFile);
    });
  });
});
```

- [ ] **Step 2: Write failing test for prompt-variables**

Create `packages/server/src/__tests__/db/queries/prompt-variables.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest';

vi.mock('../../../db/connection.js', () => ({
  query: vi.fn(),
}));

import { query } from '../../../db/connection.js';
import {
  findPromptVariablesByPostId,
  createPromptVariable,
} from '../../../db/queries/prompt-variables.js';
import type { PromptVariableRow } from '../../../db/queries/types.js';

const mockQuery = query as Mock;

const sampleVariable: PromptVariableRow = {
  id: 'ff000000-0000-0000-0000-000000000010',
  post_id: '660e8400-e29b-41d4-a716-446655440000',
  name: 'component_name',
  placeholder: 'e.g., UserProfile',
  sort_order: 0,
  default_value: 'MyComponent',
};

describe('prompt variable queries', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  describe('findPromptVariablesByPostId', () => {
    it('returns variables ordered by sort_order', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleVariable], rowCount: 1 });
      const result = await findPromptVariablesByPostId(sampleVariable.post_id);
      expect(mockQuery).toHaveBeenCalledWith(
        'SELECT * FROM prompt_variables WHERE post_id = $1 ORDER BY sort_order ASC',
        [sampleVariable.post_id],
      );
      expect(result).toEqual([sampleVariable]);
    });
  });

  describe('createPromptVariable', () => {
    it('inserts a variable and returns the row', async () => {
      mockQuery.mockResolvedValue({ rows: [sampleVariable], rowCount: 1 });
      const result = await createPromptVariable({
        postId: sampleVariable.post_id,
        name: 'component_name',
        placeholder: 'e.g., UserProfile',
        sortOrder: 0,
        defaultValue: 'MyComponent',
      });
      expect(mockQuery).toHaveBeenCalledWith(
        `INSERT INTO prompt_variables (post_id, name, placeholder, sort_order, default_value) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [sampleVariable.post_id, 'component_name', 'e.g., UserProfile', 0, 'MyComponent'],
      );
      expect(result).toEqual(sampleVariable);
    });
  });
});
```

- [ ] **Step 3: Implement post-files.ts**

Create `packages/server/src/db/queries/post-files.ts`:

```typescript
import { query } from '../connection.js';
import type { PostFileRow } from './types.js';

export async function findFilesByRevisionId(revisionId: string): Promise<PostFileRow[]> {
  const result = await query<PostFileRow>(
    'SELECT * FROM post_files WHERE revision_id = $1 ORDER BY sort_order ASC',
    [revisionId],
  );
  return result.rows;
}

export interface CreatePostFileInput {
  postId: string;
  revisionId: string;
  filename: string;
  content: string | null;
  storageKey: string | null;
  mimeType: string | null;
  sortOrder: number;
}

export async function createPostFile(input: CreatePostFileInput): Promise<PostFileRow> {
  const result = await query<PostFileRow>(
    `INSERT INTO post_files (post_id, revision_id, filename, content, storage_key, mime_type, sort_order) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      input.postId,
      input.revisionId,
      input.filename,
      input.content,
      input.storageKey,
      input.mimeType,
      input.sortOrder,
    ],
  );
  return result.rows[0]!;
}
```

- [ ] **Step 4: Implement prompt-variables.ts**

Create `packages/server/src/db/queries/prompt-variables.ts`:

```typescript
import { query } from '../connection.js';
import type { PromptVariableRow } from './types.js';

export async function findPromptVariablesByPostId(postId: string): Promise<PromptVariableRow[]> {
  const result = await query<PromptVariableRow>(
    'SELECT * FROM prompt_variables WHERE post_id = $1 ORDER BY sort_order ASC',
    [postId],
  );
  return result.rows;
}

export interface CreatePromptVariableInput {
  postId: string;
  name: string;
  placeholder: string | null;
  sortOrder: number;
  defaultValue: string | null;
}

export async function createPromptVariable(
  input: CreatePromptVariableInput,
): Promise<PromptVariableRow> {
  const result = await query<PromptVariableRow>(
    `INSERT INTO prompt_variables (post_id, name, placeholder, sort_order, default_value) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [input.postId, input.name, input.placeholder, input.sortOrder, input.defaultValue],
  );
  return result.rows[0]!;
}
```

- [ ] **Step 5: Run all query tests**

```bash
cd /Users/andrew/Code/forge && npx vitest run packages/server/src/__tests__/db/queries/
```

Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add packages/server/src/db/queries/post-files.ts packages/server/src/db/queries/prompt-variables.ts \
  packages/server/src/__tests__/db/queries/post-files.test.ts \
  packages/server/src/__tests__/db/queries/prompt-variables.test.ts
git commit -m "feat(server): add typed query helpers for post files and prompt variables"
```

---

## Task 9: Query Index & Full Test Suite (renumbered)

**Files:**

- Create: `packages/server/src/db/queries/index.ts`

- [ ] **Step 1: Create the barrel export**

Create `packages/server/src/db/queries/index.ts`:

```typescript
export * from './types.js';
export * from './users.js';
export * from './posts.js';
export * from './revisions.js';
export * from './tags.js';
export * from './comments.js';
export * from './votes.js';
export * from './bookmarks.js';
export * from './post-files.js';
export * from './prompt-variables.js';
```

- [ ] **Step 2: Verify TypeScript compilation**

```bash
cd /Users/andrew/Code/forge && npx tsc --noEmit -p packages/server/tsconfig.json
```

Expected: No errors.

- [ ] **Step 3: Run the full server test suite**

```bash
cd /Users/andrew/Code/forge && npx vitest run --project @forge/server
```

Expected: ALL PASS (health test + all query tests)

- [ ] **Step 4: Run coverage check**

```bash
cd /Users/andrew/Code/forge && npm run test:coverage
```

Verify all server TypeScript files (connection.ts, queries/\*.ts) have 100% coverage. If any file is below threshold, add missing test cases.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/db/queries/index.ts
git commit -m "feat(server): add query barrel export and verify full test coverage"
```

---

## Task 10: Seed Script

**Files:**

- Create: `scripts/seed.sql`

- [ ] **Step 1: Create the seed script**

Create `scripts/seed.sql`:

```sql
-- Forge seed data
-- Requires: migration 001_initial-schema has been applied
-- Run: psql $DATABASE_URL -f scripts/seed.sql

BEGIN;

-- Clean existing seed data (safe to re-run)
TRUNCATE users, posts, post_revisions, post_files, tags, post_tags,
         votes, bookmarks, user_tag_subscriptions, comments, prompt_variables
CASCADE;

-- ============================================================
-- Users (3: 1 Google SSO, 2 local)
-- ============================================================
INSERT INTO users (id, email, display_name, avatar_url, auth_provider, password_hash) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'alice@example.com', 'Alice Chen', 'https://i.pravatar.cc/150?u=alice', 'local', '$2b$12$LJ3m4ys3Lk0TSwHjRB0oaOQEbeSYW8.mGJCNB0QfLX5a5HLDhwNiy'),
  ('a0000000-0000-0000-0000-000000000002', 'bob@example.com', 'Bob Martinez', 'https://i.pravatar.cc/150?u=bob', 'google', NULL),
  ('a0000000-0000-0000-0000-000000000003', 'carol@example.com', 'Carol Davis', NULL, 'local', '$2b$12$LJ3m4ys3Lk0TSwHjRB0oaOQEbeSYW8.mGJCNB0QfLX5a5HLDhwNiy');

-- ============================================================
-- Tags (5)
-- ============================================================
INSERT INTO tags (id, name) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'typescript'),
  ('b0000000-0000-0000-0000-000000000002', 'python'),
  ('b0000000-0000-0000-0000-000000000003', 'ai-prompts'),
  ('b0000000-0000-0000-0000-000000000004', 'react'),
  ('b0000000-0000-0000-0000-000000000005', 'devops');

-- ============================================================
-- Posts (12: mix of snippet/prompt/document/link)
-- ============================================================
-- vote_count omitted — triggers compute it from votes inserts
INSERT INTO posts (id, author_id, title, content_type, language, visibility, is_draft, view_count) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'TypeScript Utility Types Cheat Sheet', 'snippet', 'typescript', 'public', false, 150),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'Python Async Patterns', 'snippet', 'python', 'public', false, 90),
  ('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'GPT-4 Code Review Prompt', 'prompt', NULL, 'public', false, 300),
  ('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'React Component Generator Prompt', 'prompt', NULL, 'public', false, 200),
  ('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', 'Getting Started with Docker Compose', 'document', NULL, 'public', false, 80),
  ('c0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000003', 'My Kubernetes Notes', 'document', NULL, 'private', false, 10),
  ('c0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'Awesome TypeScript Resources', 'link', NULL, 'public', false, 50),
  ('c0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000002', 'Draft: New Prompt Template', 'prompt', NULL, 'public', true, 5),
  ('c0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', 'Zod Validation Patterns', 'snippet', 'typescript', 'public', false, 120),
  ('c0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000003', 'Claude API Integration Guide', 'document', NULL, 'public', false, 250),
  ('c0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000002', 'React Testing Library Tips', 'snippet', 'typescript', 'public', false, 60),
  ('c0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'SQL Performance Tuning', 'document', NULL, 'public', false, 40);

-- Update link post
UPDATE posts SET
  link_url = 'https://github.com/type-challenges/type-challenges',
  link_preview = '{"title": "Type Challenges", "description": "Collection of TypeScript type challenges", "image": null, "reading_time": null}'::jsonb
WHERE id = 'c0000000-0000-0000-0000-000000000007';

-- ============================================================
-- Post Revisions (one per post, some posts have multiple)
-- ============================================================
INSERT INTO post_revisions (id, post_id, author_id, content, message, revision_number) VALUES
  ('d0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', E'type Partial<T> = { [P in keyof T]?: T[P] };\ntype Required<T> = { [P in keyof T]-?: T[P] };\ntype Readonly<T> = { readonly [P in keyof T]: T[P] };', 'Initial version', 1),
  ('d0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', E'type Partial<T> = { [P in keyof T]?: T[P] };\ntype Required<T> = { [P in keyof T]-?: T[P] };\ntype Readonly<T> = { readonly [P in keyof T]: T[P] };\ntype Pick<T, K extends keyof T> = { [P in K]: T[P] };', 'Added Pick type', 2),
  ('d0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', E'import asyncio\n\nasync def fetch_data(url: str) -> dict:\n    async with aiohttp.ClientSession() as session:\n        async with session.get(url) as response:\n            return await response.json()', 'Initial version', 1),
  ('d0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'Review this code for bugs, security issues, and performance problems. Provide specific line-by-line feedback with severity ratings.', 'Initial version', 1),
  ('d0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'Generate a React component with the following requirements: {{component_name}}, {{props}}, {{features}}', 'Initial version', 1),
  ('d0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000003', E'# Docker Compose Guide\n\nDocker Compose simplifies multi-container deployments...', 'Initial version', 1),
  ('d0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000003', E'# Kubernetes Notes\n\nPersonal notes on K8s concepts and commands...', 'Initial version', 1),
  ('d0000000-0000-0000-0000-000000000008', 'c0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000001', 'A curated list of TypeScript resources and type challenges.', 'Initial version', 1),
  ('d0000000-0000-0000-0000-000000000009', 'c0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000002', 'WIP: template for structured prompts', 'Draft started', 1),
  ('d0000000-0000-0000-0000-000000000010', 'c0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000001', E'import { z } from "zod";\n\nconst userSchema = z.object({\n  name: z.string().min(1),\n  email: z.string().email(),\n});', 'Initial version', 1),
  ('d0000000-0000-0000-0000-000000000011', 'c0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000003', E'# Claude API Integration\n\nHow to use the Anthropic API with streaming, tool use, and prompt caching...', 'Initial version', 1),
  ('d0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000011', 'a0000000-0000-0000-0000-000000000002', E'import { render, screen } from "@testing-library/react";\n\ntest("renders component", () => {\n  render(<MyComponent />);\n  expect(screen.getByText("Hello")).toBeInTheDocument();\n});', 'Initial version', 1),
  ('d0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', E'# SQL Performance Tuning\n\nKey techniques for optimizing PostgreSQL queries...', 'Initial version', 1);

-- ============================================================
-- Post Tags
-- ============================================================
INSERT INTO post_tags (post_id, tag_id) VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000003'),
  ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000004'),
  ('c0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000003'),
  ('c0000000-0000-0000-0000-000000000005', 'b0000000-0000-0000-0000-000000000005'),
  ('c0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000009', 'b0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000010', 'b0000000-0000-0000-0000-000000000003'),
  ('c0000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000004'),
  ('c0000000-0000-0000-0000-000000000011', 'b0000000-0000-0000-0000-000000000001');

-- tag post_count and vote_count are computed by triggers on INSERT

-- ============================================================
-- Votes
-- ============================================================
INSERT INTO votes (user_id, post_id, value) VALUES
  ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 1),
  ('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 1),
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003', 1),
  ('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000003', 1),
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', 1),
  ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000010', 1);

-- ============================================================
-- Bookmarks
-- ============================================================
INSERT INTO bookmarks (user_id, post_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000010');

-- ============================================================
-- Tag Subscriptions
-- ============================================================
INSERT INTO user_tag_subscriptions (user_id, tag_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000002', 'b0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000005');

-- ============================================================
-- Comments (threaded + inline)
-- ============================================================
INSERT INTO comments (id, post_id, author_id, parent_id, line_number, revision_id, body) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000002', NULL, NULL, NULL, 'Great cheat sheet! Very useful.'),
  ('e0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', NULL, NULL, 'Thanks Bob! I plan to add more utility types soon.'),
  ('e0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', NULL, 2, 'd0000000-0000-0000-0000-000000000002', 'Could you add an example for the Required type?'),
  ('e0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', NULL, NULL, NULL, 'This prompt works really well for catching security issues.'),
  ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', NULL, NULL, NULL, 'The streaming section is especially helpful.');

-- ============================================================
-- Prompt Variables (for prompt posts)
-- ============================================================
INSERT INTO prompt_variables (id, post_id, name, placeholder, sort_order, default_value) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', 'component_name', 'e.g., UserProfile', 0, 'MyComponent'),
  ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 'props', 'e.g., name: string, age: number', 1, NULL),
  ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000004', 'features', 'e.g., loading state, error handling', 2, 'responsive, accessible');

COMMIT;
```

- [ ] **Step 2: Commit**

```bash
git add scripts/seed.sql
git commit -m "feat: add database seed script with sample users, posts, tags, comments, and votes"
```

---

## Task 11: Integration Verification

This task verifies the migration and seed script against a real PostgreSQL instance.

**Prerequisites:** Docker PostgreSQL is running (`docker compose up -d postgres`).

- [ ] **Step 1: Start PostgreSQL**

```bash
cd /Users/andrew/Code/forge && docker compose up -d postgres
```

Wait for the health check to pass:

```bash
docker compose ps
```

- [ ] **Step 2: Set DATABASE_URL and run migration up**

```bash
cd /Users/andrew/Code/forge/packages/server && DATABASE_URL=postgresql://forge:forge_dev@localhost:5432/forge npx node-pg-migrate up --migrations-dir src/db/migrations
```

Expected: Migration applied successfully. All tables, triggers, and indexes created.

- [ ] **Step 3: Verify tables exist**

```bash
docker compose exec postgres psql -U forge -d forge -c "\dt"
```

Expected: All 10 tables listed (users, posts, post_revisions, post_files, tags, post_tags, votes, bookmarks, user_tag_subscriptions, comments, prompt_variables) plus the pgmigrations table.

- [ ] **Step 4: Verify triggers exist**

```bash
docker compose exec postgres psql -U forge -d forge -c "SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public';"
```

Expected: 6 triggers (posts_search_vector_trigger, votes_count_trigger, tag_post_count_trigger, posts_tag_count_trigger, revisions_refresh_search_vector, post_tags_refresh_search_vector).

- [ ] **Step 5: Verify indexes exist**

```bash
docker compose exec postgres psql -U forge -d forge -c "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname LIKE 'idx_%';"
```

Expected: idx_revisions_post_rev_desc, idx_posts_search_vector, idx_posts_title_trgm, idx_posts_author_id, idx_posts_created_at, idx_comments_post_id, idx_post_files_revision_id.

- [ ] **Step 6: Run seed script**

```bash
docker compose exec postgres psql -U forge -d forge -f /dev/stdin < scripts/seed.sql
```

Expected: Seed data inserted successfully.

- [ ] **Step 7: Verify seed data and triggers**

```bash
# Verify user count
docker compose exec postgres psql -U forge -d forge -c "SELECT COUNT(*) FROM users;"
# Expected: 3

# Verify post count
docker compose exec postgres psql -U forge -d forge -c "SELECT COUNT(*) FROM posts;"
# Expected: 12

# Verify vote_count trigger — vote_count should equal SUM of vote values
docker compose exec postgres psql -U forge -d forge -c "SELECT p.title, p.vote_count, COALESCE(SUM(v.value), 0) AS actual FROM posts p LEFT JOIN votes v ON v.post_id = p.id GROUP BY p.id HAVING p.vote_count != COALESCE(SUM(v.value), 0);"
# Expected: 0 rows (all vote_counts match actual vote sums)

# Verify tag post_count trigger — post_count should match count of qualifying posts
docker compose exec postgres psql -U forge -d forge -c "SELECT t.name, t.post_count, COUNT(pt.post_id) AS actual FROM tags t LEFT JOIN post_tags pt ON pt.tag_id = t.id LEFT JOIN posts p ON p.id = pt.post_id AND p.deleted_at IS NULL AND p.visibility = 'public' AND p.is_draft = false GROUP BY t.id HAVING t.post_count != COUNT(pt.post_id);"
# Expected: 0 rows (all post_counts match actual qualifying post counts)

# Verify search_vector is populated (revision trigger updates post search_vector)
docker compose exec postgres psql -U forge -d forge -c "SELECT title, search_vector IS NOT NULL AS has_vector FROM posts LIMIT 3;"
```

- [ ] **Step 8: Test migration down**

```bash
cd /Users/andrew/Code/forge/packages/server && DATABASE_URL=postgresql://forge:forge_dev@localhost:5432/forge npx node-pg-migrate down --migrations-dir src/db/migrations
```

Verify tables are gone:

```bash
docker compose exec postgres psql -U forge -d forge -c "\dt"
```

Expected: Only pgmigrations table remains.

- [ ] **Step 9: Run migration up again (to leave DB in good state)**

```bash
cd /Users/andrew/Code/forge/packages/server && DATABASE_URL=postgresql://forge:forge_dev@localhost:5432/forge npx node-pg-migrate up --migrations-dir src/db/migrations
```

- [ ] **Step 10: Run final coverage check**

```bash
cd /Users/andrew/Code/forge && npm run test:coverage
```

All server TypeScript files must hit 100% lines, branches, functions, and statements.

- [ ] **Step 11: Final commit (if any fixes needed)**

If coverage or integration tests revealed issues that required fixes, commit those fixes.
