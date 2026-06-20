-- Projects: group multiple analyses (TIFF runs) under a user-defined name.

CREATE TABLE IF NOT EXISTS projects (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects(user_id);

ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS analyses_project_id_idx ON analyses(project_id);
