-- VarNet admin web login — Telegram one-time passwords.
--
-- Apply with:
--   wrangler d1 migrations apply varnet --remote   (production)
--   wrangler d1 migrations apply varnet --local    (local wrangler runtime)
--
-- Only Telegram ids from ADMIN_TELEGRAM_IDS receive a code. `code` stores an
-- HMAC-SHA256 digest (never the plain 6-digit code), `expires_at` is an ISO
-- timestamp 5 minutes after creation, and `attempts` locks a code after five
-- wrong guesses. Rows are single-use (`consumed_at`).

CREATE TABLE IF NOT EXISTS admin_otps (
  id          TEXT PRIMARY KEY,
  telegram_id TEXT NOT NULL,
  code        TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  attempts    INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_admin_otps_expiry
  ON admin_otps (expires_at);

CREATE INDEX IF NOT EXISTS idx_admin_otps_telegram
  ON admin_otps (telegram_id, created_at);

-- Per-IP throttle for wrong verify attempts (8 failures / 10 minutes).
CREATE TABLE IF NOT EXISTS admin_otp_failures (
  ip           TEXT PRIMARY KEY,
  attempts     INTEGER NOT NULL DEFAULT 0,
  window_start TEXT NOT NULL
);
