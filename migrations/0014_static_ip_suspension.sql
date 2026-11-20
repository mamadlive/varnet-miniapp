-- Static-IP service access state (administrative suspension).
--
-- Suspension is an ACCESS decision, not a financial one: it never changes
-- `orders.status`, `orders.total`, wallet balances or receipts. While a row in
-- `static_ip_service_access` says `suspended`, the Mini App hides the delivery
-- note and every server-side route (initial token minting, token download and
-- Telegram resend) refuses the order until an admin reactivates it.
--
-- LIMITATION: this table is the only thing the Mini App/Pages Functions can
-- enforce. It does NOT revoke OpenVPN credentials that were already delivered
-- nor disconnect an already established tunnel; that requires the RADIUS
-- backend (`/v1/radius/suspend`) on the VPN server, which has no integration
-- in this project.

CREATE TABLE IF NOT EXISTS static_ip_service_access (
  order_id      TEXT PRIMARY KEY,
  -- Copied on write so the row stays meaningful even if the order's user changes.
  user_id       TEXT NOT NULL,
  state         TEXT NOT NULL DEFAULT 'active'
                CHECK (state IN ('active', 'suspended')),
  reason        TEXT,
  suspended_at  TEXT,
  suspended_by  INTEGER,
  resumed_at    TEXT,
  resumed_by    INTEGER,
  updated_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_static_ip_service_access_user
  ON static_ip_service_access (user_id, state);

CREATE INDEX IF NOT EXISTS idx_static_ip_service_access_state
  ON static_ip_service_access (state, updated_at DESC);
