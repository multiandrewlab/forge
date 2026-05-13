-- Up Migration
--
-- Video posts via Cloudflare Stream (issue #102).
--   * Extend posts.content_type to allow 'video'.
--   * Track the swap from old to new CF asset on the revision row.
--   * post_videos:        current/displayed state per post, 1:1 with posts.
--   * post_video_ai_runs: append-only history of AI metadata suggestions.
--   * cf_stream_webhook_events: per-event de-dup table for idempotent webhook handling.
--   * compute_post_search_vector(post_id): shared helper used by both the
--     posts BEFORE-trigger (A) and the post_videos AFTER-trigger (B), so
--     transcripts join the FTS index without bumping posts.updated_at.

-- posts: allow 'video' content type ─────────────────────────────────────
ALTER TABLE posts DROP CONSTRAINT posts_content_type_check;
ALTER TABLE posts
  ADD CONSTRAINT posts_content_type_check
  CHECK (content_type IN ('snippet', 'prompt', 'document', 'link', 'video'));

-- post_revisions: capture which CF asset is "live" at this revision so a
-- replacement (new video uploaded to an existing post) is recorded in history.
ALTER TABLE post_revisions ADD COLUMN video_cf_uid VARCHAR(64);

-- post_videos: current/displayed state, 1:1 with posts ──────────────────
CREATE TABLE post_videos (
  post_id UUID PRIMARY KEY REFERENCES posts(id) ON DELETE CASCADE,
  cf_uid VARCHAR(64) NOT NULL UNIQUE,
  pending_cf_uid VARCHAR(64) UNIQUE,
  status VARCHAR(20) NOT NULL CHECK (status IN
    ('uploading', 'processing', 'captions', 'suggesting', 'ready', 'failed', 'pending_cancel')),
  duration_sec INTEGER,
  size_bytes BIGINT,
  transcript TEXT,
  playback_requires_signed_url BOOLEAN NOT NULL DEFAULT false,
  last_error TEXT,
  last_status_change_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT post_videos_pending_cf_uid_distinct
    CHECK (pending_cf_uid IS NULL OR pending_cf_uid <> cf_uid)
);

-- Reconciler queries this partial index when sweeping for stalled assets.
CREATE INDEX post_videos_status_updated_at_idx
  ON post_videos (status, updated_at)
  WHERE status NOT IN ('ready', 'failed');

-- post_video_ai_runs: append-only history of metadata extractions ───────
CREATE TABLE post_video_ai_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES post_videos(post_id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT NOT NULL,
  tags TEXT[] NOT NULL,
  model VARCHAR(100) NOT NULL,
  transcript_chars INTEGER NOT NULL,
  was_truncated BOOLEAN NOT NULL DEFAULT false,
  prompt_version VARCHAR(20) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX post_video_ai_runs_post_created_idx
  ON post_video_ai_runs (post_id, created_at DESC);

-- cf_stream_webhook_events: idempotency table for CF Stream webhook callbacks.
-- Cloudflare may re-deliver the same event; INSERT … ON CONFLICT DO NOTHING
-- on event_id makes the handler safe to retry.
CREATE TABLE cf_stream_webhook_events (
  event_id VARCHAR(128) PRIMARY KEY,
  cf_uid VARCHAR(64) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX cf_stream_webhook_events_cf_uid_idx
  ON cf_stream_webhook_events (cf_uid);

-- search_vector helper extracted so both triggers share logic ──────────
-- Weighting: title (A) > tags (B) > latest-revision content (C) > transcript (D).
CREATE OR REPLACE FUNCTION compute_post_search_vector(p_post_id UUID)
RETURNS tsvector AS $$
  SELECT
    setweight(to_tsvector('forge_search', COALESCE(p.title, '')), 'A') ||
    setweight(to_tsvector('forge_search',
      COALESCE(array_to_string(ARRAY(
        SELECT t.name FROM post_tags pt
          JOIN tags t ON t.id = pt.tag_id
         WHERE pt.post_id = p.id
      ), ' '), '')
    ), 'B') ||
    setweight(to_tsvector('forge_search',
      COALESCE((SELECT content FROM post_revisions pr
                  WHERE pr.post_id = p.id
                  ORDER BY pr.revision_number DESC LIMIT 1), '')
    ), 'C') ||
    setweight(to_tsvector('forge_search',
      COALESCE((SELECT transcript FROM post_videos pv WHERE pv.post_id = p.id), '')
    ), 'D')
  FROM posts p WHERE p.id = p_post_id;
$$ LANGUAGE sql STABLE;

-- Trigger A: redefine update_search_vector (still BEFORE INSERT/UPDATE on posts)
-- to delegate to the helper. The existing posts_search_vector_trigger continues
-- to fire on every row write.
CREATE OR REPLACE FUNCTION update_search_vector() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := compute_post_search_vector(NEW.id);
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

-- Trigger B: refresh posts.search_vector when post_videos.transcript changes
-- WITHOUT touching posts.updated_at — the feed sort key — by using a direct
-- UPDATE on posts.search_vector rather than rewriting the whole row.
CREATE OR REPLACE FUNCTION refresh_post_search_vector_from_transcript()
RETURNS trigger AS $$
BEGIN
  UPDATE posts
     SET search_vector = compute_post_search_vector(NEW.post_id)
   WHERE id = NEW.post_id;
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

CREATE TRIGGER post_videos_transcript_search_vector_refresh
  AFTER UPDATE OF transcript ON post_videos
  FOR EACH ROW
  WHEN (OLD.transcript IS DISTINCT FROM NEW.transcript)
  EXECUTE FUNCTION refresh_post_search_vector_from_transcript();

-- Down Migration

DROP TRIGGER IF EXISTS post_videos_transcript_search_vector_refresh ON post_videos;
DROP FUNCTION IF EXISTS refresh_post_search_vector_from_transcript();
-- Restore the original update_search_vector body from migration 001.
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
DROP FUNCTION IF EXISTS compute_post_search_vector(UUID);

DROP INDEX IF EXISTS cf_stream_webhook_events_cf_uid_idx;
DROP TABLE IF EXISTS cf_stream_webhook_events;

DROP INDEX IF EXISTS post_video_ai_runs_post_created_idx;
DROP TABLE IF EXISTS post_video_ai_runs;

DROP INDEX IF EXISTS post_videos_status_updated_at_idx;
DROP TABLE IF EXISTS post_videos;

ALTER TABLE post_revisions DROP COLUMN IF EXISTS video_cf_uid;

ALTER TABLE posts DROP CONSTRAINT IF EXISTS posts_content_type_check;
ALTER TABLE posts
  ADD CONSTRAINT posts_content_type_check
  CHECK (content_type IN ('snippet', 'prompt', 'document', 'link'));
