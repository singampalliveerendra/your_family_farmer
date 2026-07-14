-- ============================================================
-- YourFamilyFarmer — STAGING seed data
--
-- Fake farmers, harvests and a moderator so the client has
-- something to click on. Run AFTER scripts/staging-schema.sql.
--
-- Every login below uses the password:  staging123
--
-- NEVER run this on production.
-- ============================================================

-- Region
INSERT INTO public.regions (slug, name) VALUES
  ('tadepalligudem', 'Tadepalligudem')
ON CONFLICT (slug) DO NOTHING;

-- Moderator — login with phone 9000000001 / staging123
INSERT INTO public.moderators (name, phone, password_hash, region_slug) VALUES
  ('Staging Moderator', '9000000001',
   'eba5aa59df32d92081a69140f9ef3d13:45770266d938adc1bb61e680f64a273f7817514c9137ca173eefa30a4964040874f330233712e781c456722ea1b414bad3eb4bc13d16463b4c849090a0f4f00f',
   'tadepalligudem')
ON CONFLICT (phone) DO NOTHING;

-- Farmers — login with phone 9000000011 / 9000000012, password staging123
INSERT INTO public.farmers (id, slug, name, phone, method, region_slug, password_hash) VALUES
  ('11111111-1111-4111-8111-111111111111', 'test-farmer-ravi', 'Ravi (Test)', '9000000011', 'natural', 'tadepalligudem',
   '84f94275d5070df90403c77d921f485c:998af913142ee5504fa37268297ec25f92b2723c3c60e20ea1df41385e547a6d168827f2bbb66f5f83d0536e4fc01e3969a57fe347cb5697367ef185fd32fc0c'),
  ('22222222-2222-4222-8222-222222222222', 'test-farmer-lakshmi', 'Lakshmi (Test)', '9000000012', 'natural', 'tadepalligudem',
   'c0b862695c2d44cdc3b7222365460043:39a56f5dd7171c970e788339f01e7adb6c5061feae1273e2c4d552085c47ab38f18a47de8a546220a455f81a7cd6f88f1761d8cb009a5c64ade88ed26d77ad2e')
ON CONFLICT (slug) DO NOTHING;

-- Produce
INSERT INTO public.produce_listings (id, farmer_id, name, method, unit, stock_qty, shelf_life_days, status) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Tomatoes (Test)',   'natural', 'kg', 50, 5,  'available'),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Brinjal (Test)',    'natural', 'kg', 30, 4,  'available'),
  ('aaaaaaaa-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', 'Rice (Test)',       'natural', 'kg', 100, 90, 'available')
ON CONFLICT (id) DO NOTHING;

-- Harvests — dated relative to run time, so they always look "fresh"
INSERT INTO public.harvests (produce_listing_id, farmer_id, harvested_at, shelf_life_days, unit, stock_qty) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', now() - interval '3 hours', 5,  'kg', 50),
  ('aaaaaaaa-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', now() - interval '1 day',   4,  'kg', 30),
  ('aaaaaaaa-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', now() - interval '2 days',  90, 'kg', 100);

-- Platform settings (singleton row, id must be 1)
INSERT INTO public.platform_settings (id, fee_percent, cod_deposit_percent) VALUES (1, 5, 10)
ON CONFLICT (id) DO NOTHING;
