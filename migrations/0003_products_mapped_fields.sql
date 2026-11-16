-- VarNet product catalogue — mapped fields + sync metadata.
--
-- Applied after 0002. `brand_key` and `provider_description` keep the
-- localized mapper output stable: a second (read-time) localization pass can
-- reuse the resolved brand instead of re-deriving it from Persian copy.
-- `sync_meta` stores the USDT→Toman rate used by the last sync so every client
-- prices the catalogue with the same rate.

ALTER TABLE products ADD COLUMN brand_key TEXT;
ALTER TABLE products ADD COLUMN provider_description TEXT;

CREATE TABLE IF NOT EXISTS sync_meta (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_products_provider_currency
  ON products (provider_currency);
