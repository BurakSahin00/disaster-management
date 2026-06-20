CREATE TABLE IF NOT EXISTS registration_requests (
  id               TEXT PRIMARY KEY,
  email            TEXT UNIQUE NOT NULL,
  password_hash    TEXT NOT NULL,
  status           TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected')),
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at      TIMESTAMPTZ,
  reviewed_by      TEXT REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS reg_requests_email_idx ON registration_requests(email);
CREATE INDEX IF NOT EXISTS reg_requests_status_idx ON registration_requests(status);
