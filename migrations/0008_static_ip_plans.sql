-- Selling plans for static IP — fully managed from the admin panel.
-- A plan ties a quota + duration + price to a node; the Mini App sells plan ids.
--
-- Apply with:
--   wrangler d1 migrations apply varnet --remote   (production)
--   wrangler d1 migrations apply varnet --local    (local wrangler runtime)

CREATE TABLE IF NOT EXISTS static_ip_plans (
  id            TEXT PRIMARY KEY,
  node_id       TEXT NOT NULL REFERENCES static_ip_nodes(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  data_cap_gb   INTEGER NOT NULL,
  duration_days INTEGER NOT NULL,
  price         INTEGER NOT NULL,
  currency      TEXT NOT NULL DEFAULT 'IRT',
  is_enabled    INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_static_ip_plans_catalogue
  ON static_ip_plans (is_enabled, sort_order);

CREATE INDEX IF NOT EXISTS idx_static_ip_plans_node
  ON static_ip_plans (node_id);

INSERT OR IGNORE INTO static_ip_plans
  (id, node_id, name, data_cap_gb, duration_days, price, currency, is_enabled, sort_order, created_at, updated_at)
VALUES
  ('plan_fra_10g_1m', 'node_fra', 'پلن ۱۰ گیگابایت · ۱ ماهه', 10, 30, 120000, 'IRT', 1, 10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('plan_fra_50g_1m', 'node_fra', 'پلن ۵۰ گیگابایت · ۱ ماهه', 50, 30, 150000, 'IRT', 1, 20, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('plan_fra_100g_3m', 'node_fra', 'پلن ۱۰۰ گیگابایت · ۳ ماهه', 100, 90, 390000, 'IRT', 1, 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
