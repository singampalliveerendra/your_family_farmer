-- ============================================================
-- STAGING ONLY — one-time patch.
--
-- The first seed put the test farmers in region 'test-region', but the app's
-- default region (and therefore where consumer demand intents land) is
-- 'tadepalligudem'. Farmers only see intents raised in their own region, so
-- with the mismatch a test intent would never reach the test farmers.
--
-- Run this once in the YFF-Staging SQL Editor. Safe to re-run.
-- Do NOT run on production.
-- ============================================================

INSERT INTO public.regions (slug, name) VALUES ('tadepalligudem', 'Tadepalligudem')
ON CONFLICT (slug) DO NOTHING;

UPDATE public.farmers    SET region_slug = 'tadepalligudem' WHERE region_slug = 'test-region';
UPDATE public.moderators SET region_slug = 'tadepalligudem' WHERE region_slug = 'test-region';

DELETE FROM public.regions WHERE slug = 'test-region';

-- Check: both test farmers should come back as 'tadepalligudem'
SELECT name, region_slug FROM public.farmers ORDER BY name;
