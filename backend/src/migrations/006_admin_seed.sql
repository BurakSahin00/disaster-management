-- Creates default admin user.  Default credentials: admin@disastersense.local / admin123
-- Password hash generated with bcrypt cost=10.
-- Change the password immediately after first login in production.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO users (id, email, password_hash, role)
VALUES (
  'admin',
  'admin@disastersense.local',
  crypt('admin123', gen_salt('bf', 10)),
  'admin'
)
ON CONFLICT (id) DO NOTHING;

-- Demo analyst account
INSERT INTO users (id, email, password_hash, role)
VALUES (
  'analyst1',
  'analyst@disastersense.local',
  crypt('analyst123', gen_salt('bf', 10)),
  'analyst'
)
ON CONFLICT (id) DO NOTHING;
