ALTER TABLE products ADD COLUMN logo_url TEXT;

ALTER TABLE product_overrides ADD COLUMN is_deleted INTEGER NOT NULL DEFAULT 0
  CHECK (is_deleted IN (0, 1));
