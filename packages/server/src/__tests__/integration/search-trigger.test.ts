/**
 * WU-001: Integration test for search_vector trigger
 *
 * This suite verifies that migration 001_initial-schema.sql correctly
 * populates `posts.search_vector` via the `update_search_vector` trigger
 * and its refresh triggers on `post_revisions` / `post_tags`.
 *
 * IT IS INTENTIONALLY SKIPPED — no integration-test harness exists in
 * this repo yet (no Testcontainers, no docker-compose test DB, no
 * truncation helpers). Unit tests mock the `query` function, and running
 * integration tests against the dev DB in CI is not configured.
 *
 * TODO (follow-up issue):
 *   - Establish an integration harness (Testcontainers-Postgres or
 *     `docker compose -f docker-compose.test.yml` pattern).
 *   - Remove `.skip` from this suite and run it in CI.
 *   - Add a `vitest.integration.config.ts` profile that is excluded
 *     from the normal coverage run (this file is expected to be in
 *     the coverage `exclude` list so skipping it does not drop metrics).
 *
 * Assertions are captured here so the future harness only needs to
 * provide the `pool` and clean-up helpers.
 */
import { describe, it, expect } from 'vitest';

describe.skip('search_vector trigger (integration)', () => {
  // The test body below is illustrative; it will execute once the
  // integration harness lands and `.skip` is removed.
  it('populates search_vector on post insert + revision + tag', async () => {
    // Arrange: create user, post, revision, tag
    // const userId = await seedUser(...)
    // const postId = await seedPost(userId, { title: 'React Hooks Primer' })
    // await seedRevision(postId, 'useState and useEffect are core hooks...')
    // await seedTag(postId, 'javascript')

    // Act: fetch the search_vector
    // const { rows } = await pool.query(
    //   "SELECT search_vector::text AS v FROM posts WHERE id = $1",
    //   [postId],
    // )

    // Assert: weighted tokens present (title A, content B, tag C)
    // expect(rows[0].v).toMatch(/react/i)
    // expect(rows[0].v).toMatch(/hook/i)
    // expect(rows[0].v).toMatch(/javascript/i)

    // Assert: forge_search tsquery matches via @@ operator
    // const match = await pool.query(
    //   "SELECT 1 FROM posts WHERE id = $1 " +
    //     "AND search_vector @@ plainto_tsquery('forge_search', 'react')",
    //   [postId],
    // )
    // expect(match.rowCount).toBe(1)

    // Sentinel so the skipped body is syntactically valid.
    expect(true).toBe(true);
  });
});
