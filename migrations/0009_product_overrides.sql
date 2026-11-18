ALTER TABLE products ADD COLUMN provider_title TEXT;

CREATE TABLE IF NOT EXISTS product_overrides (
  product_id     TEXT NOT NULL PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
  fa_description TEXT,
  custom_category TEXT CHECK (custom_category IS NULL OR custom_category IN (
    'ai', 'design', 'os', 'office', 'security', 'streaming', 'dev', 'social', 'gaming', 'other'
  )),
  is_featured    INTEGER NOT NULL DEFAULT 0 CHECK (is_featured IN (0, 1)),
  is_bestseller  INTEGER NOT NULL DEFAULT 0 CHECK (is_bestseller IN (0, 1))
);
