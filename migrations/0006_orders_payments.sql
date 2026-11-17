-- Real order management + card-to-card payment receipts.
--
-- Orders gain the payment channel they were created with and an optional
-- delivery note (account/config text an admin sends when completing a paid
-- order). `payment_receipts` stores card-to-card claims for both wallet
-- top-ups and direct product purchases until an admin approves them.

ALTER TABLE orders ADD COLUMN payment_method TEXT NOT NULL DEFAULT 'wallet';
ALTER TABLE orders ADD COLUMN delivery_note TEXT;
ALTER TABLE orders ADD COLUMN updated_at TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_user_created
  ON orders (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_created
  ON orders (created_at DESC);

CREATE TABLE IF NOT EXISTS payment_receipts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  telegram_id INTEGER NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('wallet_topup', 'product_purchase')),
  order_id TEXT,
  amount INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'IRT',
  reference TEXT NOT NULL,
  bank_card TEXT,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  note TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_receipts_status_created
  ON payment_receipts (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_receipts_user_created
  ON payment_receipts (user_id, created_at DESC);

INSERT OR IGNORE INTO settings (key, value, updated_at)
  VALUES ('bank_card_number', '', datetime('now'));
INSERT OR IGNORE INTO settings (key, value, updated_at)
  VALUES ('bank_account_holder', '', datetime('now'));
INSERT OR IGNORE INTO settings (key, value, updated_at)
  VALUES ('bank_name', '', datetime('now'));
