-- Featured static-IP plans on the Mini App home page.
--
-- `is_featured = 1` promotes a plan into the «پیشنهادهای ویژه» row of the Mini
-- App home, next to the featured marketplace accounts. A plan is only ever
-- shown there when it is also `is_enabled = 1` and attached to an enabled node,
-- so promoting a hidden plan never exposes it.
--
-- Apply with:
--   wrangler d1 migrations apply varnet --remote   (production)
--   wrangler d1 migrations apply varnet --local    (local wrangler runtime)

ALTER TABLE static_ip_plans ADD COLUMN is_featured INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_static_ip_plans_featured
  ON static_ip_plans (is_featured, sort_order);
