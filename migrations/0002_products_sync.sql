-- VarNet product catalogue — D1 schema for provider syncs.
--
-- Apply with:
--   wrangler d1 migrations apply varnet --remote   (production)
--   wrangler d1 migrations apply varnet --local    (local wrangler runtime)
--
-- Rows are upserted by `POST /api/sync` (functions/api/sync.ts) in batches.
-- `price` and `old_price` are integer Toman (IRT); the `provider_*` columns
-- keep the raw upstream amount so the admin panel can reprice from USDT.

CREATE TABLE IF NOT EXISTS products (
  id                   TEXT PRIMARY KEY,
  title                TEXT NOT NULL,
  subtitle             TEXT,
  category             TEXT NOT NULL DEFAULT 'other',
  price                INTEGER NOT NULL,
  old_price            INTEGER,
  provider_price       REAL,
  provider_old_price   REAL,
  provider_currency    TEXT NOT NULL DEFAULT 'USDT',
  currency             TEXT NOT NULL DEFAULT 'IRT',
  stock                INTEGER NOT NULL DEFAULT 0,
  rating               REAL,
  review_count         INTEGER,
  badge                TEXT,
  delivery_time        TEXT,
  description          TEXT,
  features             TEXT,                 -- JSON array of strings
  gradient             TEXT,
  emoji                TEXT,
  synced_at            TEXT NOT NULL,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_synced_at ON products (synced_at DESC);
