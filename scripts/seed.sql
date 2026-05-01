-- Forge seed data
-- Requires: migration 001_initial-schema has been applied
-- Run: psql $DATABASE_URL -f scripts/seed.sql

BEGIN;

-- Clean existing seed data (safe to re-run)
TRUNCATE users, posts, post_revisions, post_files, tags, post_tags,
         votes, bookmarks, user_tag_subscriptions, comments, prompt_variables
CASCADE;

-- ============================================================
-- Users (4: 1 Google SSO, 3 local)
-- ============================================================
-- testuser (Bruno regression test user — password: "password123")
-- Regenerate hash: cd packages/server && node -e 'import("bcryptjs").then(b => b.default.hash("password123", 12).then(h => console.log(h)))'
INSERT INTO users (id, email, display_name, avatar_url, auth_provider, password_hash) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'alice@example.com', 'Alice Chen', 'https://i.pravatar.cc/150?u=alice', 'local', '$2b$12$jrcHUcVQnE.swctPk5GnreW9hkkyFqh8A9p2GnEaRrbxEaxXESYw2'),
  ('a0000000-0000-0000-0000-000000000002', 'bob@example.com', 'Bob Martinez', 'https://i.pravatar.cc/150?u=bob', 'google', NULL),
  ('a0000000-0000-0000-0000-000000000003', 'carol@example.com', 'Carol Davis', NULL, 'local', '$2b$12$jrcHUcVQnE.swctPk5GnreW9hkkyFqh8A9p2GnEaRrbxEaxXESYw2'),
  ('a0000000-0000-0000-0000-000000000099', 'testuser@example.com', 'Test User', NULL, 'local', '$2b$12$jrcHUcVQnE.swctPk5GnreW9hkkyFqh8A9p2GnEaRrbxEaxXESYw2'),
  ('a0000000-0000-0000-0000-000000000004', 'paginationuser@example.com', 'Pagination User', NULL, 'local', '$2b$12$jrcHUcVQnE.swctPk5GnreW9hkkyFqh8A9p2GnEaRrbxEaxXESYw2');

-- ============================================================
-- Tags (5)
-- ============================================================
INSERT INTO tags (id, name) VALUES
  ('b0000000-0000-0000-0000-000000000001', 'typescript'),
  ('b0000000-0000-0000-0000-000000000002', 'python'),
  ('b0000000-0000-0000-0000-000000000003', 'ai-prompts'),
  ('b0000000-0000-0000-0000-000000000004', 'react'),
  ('b0000000-0000-0000-0000-000000000005', 'devops'),
  ('b0000000-0000-0000-0000-000000000006', 'tag-pagination-fixture');

-- ============================================================
-- Posts (13: mix of snippet/prompt/document/link + testuser fixture)
-- ============================================================
-- vote_count omitted -- triggers compute it from votes inserts
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
  ('c0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', 'SQL Performance Tuning', 'document', NULL, 'public', false, 40),
  -- testuser-owned fixture post for Bruno regression tests
  ('c0000000-0000-0000-0000-000000000099', 'a0000000-0000-0000-0000-000000000099', 'Test Fixture Post (testuser-owned)', 'snippet', 'typescript', 'public', false, 0),
  ('c0000000-0000-0000-0000-000000000098', 'a0000000-0000-0000-0000-000000000099', 'Forge E2E Draft Sandbox (testuser)', 'snippet', 'typescript', 'public', true, 0),
  -- #50: dedicated required-var fixture post (one NULL-default variable). Used by bruno/playground/run-prompt-missing-required.bru and e2e/specs/playground/missing-variable-error.spec.ts.
  ('c0000000-0000-0000-0000-000000000050', 'a0000000-0000-0000-0000-000000000099', 'Required-var Fixture (E2E + Bruno)', 'prompt', NULL, 'public', false, 0),
  -- #50: dedicated multi-required-var fixture post (three NULL-default variables). Used by e2e/specs/playground/playground-run.spec.ts:multiple-required-vars to avoid the cross-worker reset race in ad-hoc seedPromptPost (a freshly-POSTed post can be wiped between client POST and the page's GET when another worker resets the DB).
  ('c0000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000099', 'Multi-required-var Fixture (E2E)', 'prompt', NULL, 'public', false, 0);

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
  ('d0000000-0000-0000-0000-000000000013', 'c0000000-0000-0000-0000-000000000012', 'a0000000-0000-0000-0000-000000000001', E'# SQL Performance Tuning\n\nKey techniques for optimizing PostgreSQL queries...', 'Initial version', 1),
  ('d0000000-0000-0000-0000-000000000099', 'c0000000-0000-0000-0000-000000000099', 'a0000000-0000-0000-0000-000000000099', 'const testFixture: string = "hello from testuser";', 'Initial version', 1)
  ,
  ('d0000000-0000-0000-0000-000000000098', 'c0000000-0000-0000-0000-000000000098', 'a0000000-0000-0000-0000-000000000099', 'const draftFixture: string = "draft body for E2E publish-toggle test";', 'Initial draft version', 1),
  ('d0000000-0000-0000-0000-000000000100', 'c0000000-0000-0000-0000-000000000099', 'a0000000-0000-0000-0000-000000000099', E'const testFixture: string = "hello from testuser v2";\nexport default testFixture;', 'Second revision — added export', 2),
  ('d0000000-0000-0000-0000-000000000101', 'c0000000-0000-0000-0000-000000000099', 'a0000000-0000-0000-0000-000000000099', E'const testFixture: string = "hello from testuser v3 with more body";\nexport default testFixture;\n// trailing comment for diff visibility', 'Third revision — comment + body change', 3),
  -- #50: initial revision for the required-var fixture post
  ('d0000000-0000-0000-0000-000000000050', 'c0000000-0000-0000-0000-000000000050', 'a0000000-0000-0000-0000-000000000099', 'Hello {{required_name}}!', 'Initial fixture for #50', 1),
  -- #50: initial revision for the multi-required-var fixture post
  ('d0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', 'a0000000-0000-0000-0000-000000000099', 'Hello {{name}}, you are a {{role}} working on {{project}}.', 'Initial fixture for #50 multi-var', 1);

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
  ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000010', 1)
  ,
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000099', 1);

-- ============================================================
-- Bookmarks
-- ============================================================
INSERT INTO bookmarks (user_id, post_id) VALUES
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000010')
  ,
  ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000099');

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
  ('e0000000-0000-0000-0000-000000000005', 'c0000000-0000-0000-0000-000000000010', 'a0000000-0000-0000-0000-000000000001', NULL, NULL, NULL, 'The streaming section is especially helpful.'),
  -- testuser-owned fixture comment for Bruno regression tests
  ('e0000000-0000-0000-0000-000000000099', 'c0000000-0000-0000-0000-000000000099', 'a0000000-0000-0000-0000-000000000099', NULL, NULL, NULL, 'Fixture comment by testuser');

-- ============================================================
-- Prompt Variables (for prompt posts)
-- ============================================================
INSERT INTO prompt_variables (id, post_id, name, placeholder, sort_order, default_value) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000004', 'component_name', 'e.g., UserProfile', 0, 'MyComponent'),
  ('f0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000004', 'props', 'e.g., name: string, age: number', 1, 'name: string, age: number'),  -- #50: was NULL; required-var gating would surprise-block the demo prompt
  ('f0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000004', 'features', 'e.g., loading state, error handling', 2, 'responsive, accessible'),
  -- #50: required-var fixture row (NULL default — always required)
  ('f0000000-0000-0000-0000-000000000050', 'c0000000-0000-0000-0000-000000000050', 'required_name', 'e.g., world', 0, NULL),
  -- #50: multi-required-var fixture rows (three NULL-default vars — all required)
  ('f0000000-0000-0000-0000-000000000051', 'c0000000-0000-0000-0000-000000000051', 'name', 'e.g., Andrew', 0, NULL),
  ('f0000000-0000-0000-0000-000000000052', 'c0000000-0000-0000-0000-000000000051', 'role', 'e.g., engineer', 1, NULL),
  ('f0000000-0000-0000-0000-000000000053', 'c0000000-0000-0000-0000-000000000051', 'project', 'e.g., forge', 2, NULL);

-- ============================================================
-- Pagination fixture posts (Issue #49 — deterministic data
-- for e2e/specs/search/pagination.spec.ts and filter-chip-since.spec.ts)
--
-- NOTE: revision UUID range shifted from 100-124 to 200-224 to avoid
-- collision with existing testuser revisions at d0...000100/000101.
-- Post UUID range shifted to 200-224 in lockstep so post+revision share
-- the same numeric suffix for easier cross-referencing.
-- ============================================================

INSERT INTO posts (id, author_id, title, content_type, language, visibility, is_draft, view_count, created_at)
SELECT
  ('c0000000-0000-0000-0000-000000000' || lpad((200 + n)::text, 3, '0'))::uuid,
  'a0000000-0000-0000-0000-000000000004',
  'Pagination fixture post ' || n,
  'snippet',
  'typescript',
  'public',
  false,
  0,
  NOW() - interval '2 days'
FROM generate_series(1, 25) AS n;

INSERT INTO post_revisions (id, post_id, author_id, content, message, revision_number)
SELECT
  ('d0000000-0000-0000-0000-000000000' || lpad((200 + n)::text, 3, '0'))::uuid,
  ('c0000000-0000-0000-0000-000000000' || lpad((200 + n)::text, 3, '0'))::uuid,
  'a0000000-0000-0000-0000-000000000004',
  'pagination fixture body ' || n,
  'Initial pagination fixture',
  1
FROM generate_series(1, 25) AS n;

INSERT INTO post_tags (post_id, tag_id)
SELECT
  ('c0000000-0000-0000-0000-000000000' || lpad((200 + n)::text, 3, '0'))::uuid,
  'b0000000-0000-0000-0000-000000000006'
FROM generate_series(1, 25) AS n;

COMMIT;
