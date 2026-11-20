-- Discount amounts are integer Toman; codes are unique regardless of ASCII case.
CREATE TABLE IF NOT EXISTS discount_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE COLLATE NOCASE,
  type TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
  value INTEGER NOT NULL CHECK (value > 0 AND (type != 'percent' OR value <= 100)),
  min_subtotal INTEGER CHECK (min_subtotal IS NULL OR min_subtotal >= 0),
  max_discount INTEGER CHECK (max_discount IS NULL OR max_discount >= 0),
  usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
  used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  expires_at TEXT,
  description TEXT
);
