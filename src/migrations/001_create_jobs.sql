-- src/migrations/001_create_jobs.sql
CREATE TABLE IF NOT EXISTS jobs (
  id           TEXT PRIMARY KEY,
  status       TEXT NOT NULL
                 CHECK (status IN ('pending','running','completed','failed')),
  pre_path     TEXT NOT NULL,
  post_path    TEXT NOT NULL,
  output_dir   TEXT NOT NULL,
  result       JSONB,
  error        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
