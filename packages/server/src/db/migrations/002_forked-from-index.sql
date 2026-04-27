CREATE INDEX IF NOT EXISTS idx_posts_forked_from_id ON posts(forked_from_id) WHERE forked_from_id IS NOT NULL;
