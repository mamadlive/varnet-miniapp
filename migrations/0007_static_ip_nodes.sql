-- Static-IP node catalogue — managed from the admin panel.
--
-- Apply with:
--   wrangler d1 migrations apply varnet --remote   (production)
--   wrangler d1 migrations apply varnet --local    (local wrangler runtime)

CREATE TABLE IF NOT EXISTS static_ip_nodes (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  ip            TEXT NOT NULL,
  country       TEXT NOT NULL DEFAULT 'آلمان',
  country_code  TEXT NOT NULL DEFAULT 'DE',
  protocol      TEXT NOT NULL DEFAULT 'OpenVPN (UDP)',
  price         INTEGER NOT NULL DEFAULT 150000,
  currency      TEXT NOT NULL DEFAULT 'IRT',
  duration_days INTEGER NOT NULL DEFAULT 30,
  data_cap_gb   INTEGER NOT NULL DEFAULT 50,
  availability  TEXT NOT NULL DEFAULT 'in_stock'
                CHECK (availability IN ('in_stock', 'coming_soon', 'sold_out')),
  is_enabled    INTEGER NOT NULL DEFAULT 1,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_static_ip_nodes_enabled
  ON static_ip_nodes (is_enabled, sort_order);

INSERT OR IGNORE INTO static_ip_nodes
  (id, name, ip, country, country_code, protocol, price, currency, duration_days, data_cap_gb, availability, is_enabled, sort_order, created_at, updated_at)
VALUES
  ('node_fra', 'آی‌پی ثابت اختصاصی · آلمان', '45.83.104.21', 'آلمان', 'DE', 'OpenVPN (UDP)', 150000, 'IRT', 30, 50, 'in_stock', 1, 10, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('node_lon', 'آی‌پی ثابت اختصاصی · انگلیس', '51.140.22.18', 'انگلیس', 'GB', 'OpenVPN (UDP)', 180000, 'IRT', 30, 50, 'coming_soon', 0, 20, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('node_par', 'آی‌پی ثابت اختصاصی · فرانسه', '51.138.44.91', 'فرانسه', 'FR', 'OpenVPN (UDP)', 180000, 'IRT', 30, 50, 'coming_soon', 0, 30, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('node_nyc', 'آی‌پی ثابت اختصاصی · آمریکا', '104.208.77.36', 'آمریکا', 'US', 'OpenVPN (UDP)', 220000, 'IRT', 30, 50, 'coming_soon', 0, 40, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('node_tor', 'آی‌پی ثابت اختصاصی · کانادا', '20.151.63.204', 'کانادا', 'CA', 'OpenVPN (UDP)', 220000, 'IRT', 30, 50, 'coming_soon', 0, 50, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('node_ams', 'آی‌پی ثابت اختصاصی · هلند', '193.27.13.87', 'هلند', 'NL', 'OpenVPN (UDP)', 180000, 'IRT', 30, 50, 'coming_soon', 0, 60, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
