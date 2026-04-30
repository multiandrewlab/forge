-- Index supporting the new feed visibility clause `(p.visibility = 'public' OR p.author_id = $userId)`
-- and direct-lookup visibility checks. Partial index excludes soft-deleted rows.
CREATE INDEX IF NOT EXISTS idx_posts_visibility_author
  ON posts(visibility, author_id)
  WHERE deleted_at IS NULL;
