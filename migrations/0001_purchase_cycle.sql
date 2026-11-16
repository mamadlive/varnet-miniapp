-- VarNet purchase cycle — D1 schema.
--
-- Apply with:
--   wrangler d1 migrations apply varnet --remote   (production)
--   wrangler d1 migrations apply varnet --local    (local wrangler runtime)
--
-- All amounts are integer Toman (IRT).

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,             -- usr_tg_<telegram id>
  telegram_id INTEGER NOT NULL UNIQUE,
  username    TEXT,
  first_name  TEXT,
  last_name   TEXT,
  balance     INTEGER NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'IRT',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id           TEXT PRIMARY KEY,
  user_id      TEXT NOT NULL,
  product_id   TEXT NOT NULL,
  product_title TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'account',
  quantity     INTEGER NOT NULL DEFAULT 1,
  subtotal     INTEGER NOT NULL,
  discount     INTEGER NOT NULL DEFAULT 0,
  total        INTEGER NOT NULL,
  currency     TEXT NOT NULL DEFAULT 'IRT',
  coupon_code  TEXT,
  status       TEXT NOT NULL DEFAULT 'paid',
  created_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created
  ON orders (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL,
  type          TEXT NOT NULL,              -- purchase | deposit | refund
  amount        INTEGER NOT NULL,           -- negative for purchases
  balance_after INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'IRT',
  description   TEXT NOT NULL,
  reference     TEXT,                       -- order id
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_wallet_tx_user_created
  ON wallet_transactions (user_id, created_at DESC);

-- Manual wallet credit (admin/ops):
--   UPDATE users SET balance = balance + 500000, updated_at = datetime('now')
--   WHERE telegram_id = 123456789;
