-- Up Migration

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

CREATE TEXT SEARCH CONFIGURATION forge_search (COPY = english);
ALTER TEXT SEARCH CONFIGURATION forge_search
  ALTER MAPPING FOR word, asciiword WITH unaccent, english_stem;

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

CREATE TABLE tags (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(100) UNIQUE NOT NULL,
  post_count INT NOT NULL DEFAULT 0
);

CREATE TABLE post_tags (
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, tag_id)
);

CREATE TABLE votes (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  value SMALLINT NOT NULL CHECK (value IN (1, -1)),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE bookmarks (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, post_id)
);

CREATE TABLE user_tag_subscriptions (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, tag_id)
);

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

CREATE TABLE prompt_variables (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  placeholder VARCHAR(500),
  sort_order INT NOT NULL DEFAULT 0,
  default_value TEXT,
  UNIQUE(post_id, name)
);

-- Indexes
CREATE INDEX idx_revisions_post_rev_desc ON post_revisions(post_id, revision_number DESC);
CREATE INDEX idx_posts_search_vector ON posts USING GIN (search_vector);
CREATE INDEX idx_posts_title_trgm ON posts USING GIN (title gin_trgm_ops);
CREATE INDEX idx_posts_author_id ON posts(author_id);
CREATE INDEX idx_posts_created_at ON posts(created_at DESC);
CREATE INDEX idx_comments_post_id ON comments(post_id);
CREATE INDEX idx_post_files_revision_id ON post_files(revision_id);

-- 1. search_vector trigger
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

-- 2. vote_count trigger
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

-- 3. tag post_count trigger on post_tags
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

-- 3b. tag post_count trigger on post state changes
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
