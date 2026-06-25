-- ============================================================================
-- YourFamilyFarmer — combined pending migrations (Trello card batch, 2026-06-25)
-- Paste-and-run as one block in the Supabase SQL editor. All statements are
-- idempotent (ADD COLUMN IF NOT EXISTS), so it is safe to re-run.
-- ============================================================================

-- 1) Consumer demand-intents ownership (My raised intents: view/edit/remove)
ALTER TABLE demand_intents     ADD COLUMN IF NOT EXISTS consumer_id uuid;
CREATE INDEX IF NOT EXISTS demand_intents_consumer_id_idx ON demand_intents (consumer_id);

-- 2) Soil pH on the farm profile (shown in the Quality tab)
ALTER TABLE farmers            ADD COLUMN IF NOT EXISTS soil_ph numeric;

-- 3) Produce category (drives the Veg/Fruit/Grain/Leafy filter) + multi-photos
ALTER TABLE produce_listings   ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE produce_listings   ADD COLUMN IF NOT EXISTS image_urls jsonb;

-- 4) Per-produce quality / growing fields
ALTER TABLE produce_listings   ADD COLUMN IF NOT EXISTS soil_ph numeric;
ALTER TABLE produce_listings   ADD COLUMN IF NOT EXISTS how_we_grow text;
ALTER TABLE produce_listings   ADD COLUMN IF NOT EXISTS pesticide_result text;
