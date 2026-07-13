-- App login allowlist. Re-run safely (upserts by email).
-- Add executives: INSERT ... ON CONFLICT below. Add Marc when you have his email.

INSERT INTO app_users (email, role, display_name) VALUES
  ('das@moverpilot.ai', 'admin', 'Das'),
  ('jalexis18@gmail.com', 'admin', 'J Alexis')
ON CONFLICT (email) DO UPDATE SET
  role = EXCLUDED.role,
  display_name = EXCLUDED.display_name,
  active = true;

-- Marc (admin) — uncomment and set email when known:
-- INSERT INTO app_users (email, role, display_name) VALUES
--   ('marc@example.com', 'admin', 'Marc')
-- ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name, active = true;

-- Executives (quote entry + dispositions only) — add rows like:
-- INSERT INTO app_users (email, role, display_name) VALUES
--   ('closer@dependablemovers.com', 'executive', 'Closer Name')
-- ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, display_name = EXCLUDED.display_name, active = true;
