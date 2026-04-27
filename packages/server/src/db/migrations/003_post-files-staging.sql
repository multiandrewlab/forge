ALTER TABLE post_files ALTER COLUMN revision_id DROP NOT NULL;

ALTER TABLE post_files ADD COLUMN file_size INTEGER;

CREATE INDEX idx_post_files_staged ON post_files(post_id) WHERE revision_id IS NULL;
