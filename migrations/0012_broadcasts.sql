-- A snapshot of recipients and durable per-recipient outcomes for resumable broadcasts.
CREATE TABLE IF NOT EXISTS broadcasts (
  id TEXT PRIMARY KEY,
  message TEXT NOT NULL,
  audience TEXT NOT NULL,
  target TEXT,
  photo_url TEXT,
  button_label TEXT,
  button_url TEXT,
  created_at TEXT NOT NULL,
  admin_id INTEGER NOT NULL,
  processing_until INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS broadcast_recipients (
  broadcast_id TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  PRIMARY KEY (broadcast_id, chat_id),
  FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id)
);
CREATE INDEX IF NOT EXISTS idx_broadcast_recipients_status ON broadcast_recipients (broadcast_id, status, chat_id);
