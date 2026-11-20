-- Real two-way support inbox shared by the Mini App and the admin panel.
--
-- `support_tickets.user_id` is derived server-side from the signed Telegram
-- `initData` (`usr_tg_<telegram id>`); the client never sends an identity.
-- `support_tickets.order_id` is optional and is only stored after the order is
-- proven to belong to the same user in D1. `telegram_id` is kept denormalised
-- so the admin panel can reach the customer without an extra join.
--
-- Status flow: open (waiting for support) -> answered (support replied)
-- -> closed. A user reply re-opens an answered ticket.

CREATE TABLE IF NOT EXISTS support_tickets (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  telegram_id INTEGER NOT NULL,
  order_id    TEXT,
  category    TEXT NOT NULL DEFAULT 'other'
                CHECK (category IN ('technical', 'billing', 'order', 'other')),
  subject     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open'
                CHECK (status IN ('open', 'answered', 'closed')),
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user_updated
  ON support_tickets (user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_status_updated
  ON support_tickets (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_support_tickets_order
  ON support_tickets (order_id);

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id         TEXT PRIMARY KEY,
  ticket_id  TEXT NOT NULL,
  author     TEXT NOT NULL CHECK (author IN ('user', 'support')),
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (ticket_id) REFERENCES support_tickets (id)
);

CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket
  ON support_ticket_messages (ticket_id, created_at);
