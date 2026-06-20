-- Default seed records so jobs can auto-create analyses without a pre-registered user/image.
INSERT INTO users (id, email, password_hash, role)
VALUES ('system', 'system@disastersense.local', 'n/a', 'analyst')
ON CONFLICT (id) DO NOTHING;

INSERT INTO satellite_images (id, uri)
VALUES
  ('image-pre',  'placeholder://pre'),
  ('image-post', 'placeholder://post')
ON CONFLICT (id) DO NOTHING;
