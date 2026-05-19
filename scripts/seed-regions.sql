-- Seed: regions
-- Re-run this any time you reset the database. Farmer signup hard-codes
-- region_slug = 'tadepalligudem' (src/app/api/auth/register/route.ts), and
-- farmers.region_slug has a FK to regions.slug — so this row must exist or
-- signup fails with farmers_region_slug_fkey.
--
-- Idempotent: safe to run repeatedly.

INSERT INTO regions (slug, name, district, active)
VALUES ('tadepalligudem', 'Tadepalligudem', 'West Godavari', true)
ON CONFLICT (slug) DO UPDATE
  SET name     = EXCLUDED.name,
      district = EXCLUDED.district,
      active   = true;

-- If regions has extra NOT NULL columns, add them above (both the column
-- list and VALUES) — the insert will error naming the missing column.
