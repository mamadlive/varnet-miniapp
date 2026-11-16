-- VarNet admin settings — role column + key/value settings store.
--
-- Apply with:
--   wrangler d1 migrations apply varnet --remote   (production)
--   wrangler d1 migrations apply varnet --local    (local wrangler runtime)
--
-- `settings` keeps admin-editable configuration (currently `margin_tiers`).
-- `users.role` lets the admin API authorize callers from D1 instead of a
-- separate table.

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Default tier ladder; mirrors the fallback in functions/api/admin/_shared.ts.
INSERT OR IGNORE INTO settings (key, value, updated_at)
VALUES (
  'margin_tiers',
  '[{"upToUsd":1,"percent":70},{"upToUsd":2,"percent":60},{"upToUsd":3,"percent":50},{"upToUsd":4,"percent":45},{"upToUsd":5,"percent":40},{"upToUsd":6,"percent":30},{"upToUsd":7,"percent":25},{"upToUsd":8,"percent":20},{"upToUsd":null,"percent":15}]',
  datetime('now')
);
