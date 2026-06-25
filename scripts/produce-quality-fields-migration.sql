-- Per-produce quality/growing fields the farmer enters in the add-produce form
-- (cards #18/#19/#20 applied at produce level). soil_ph defaults from the farm
-- profile but is overridable per listing; pesticide_result already exists.
-- Safe to re-run.
ALTER TABLE produce_listings ADD COLUMN IF NOT EXISTS soil_ph numeric;
ALTER TABLE produce_listings ADD COLUMN IF NOT EXISTS how_we_grow text;
ALTER TABLE produce_listings ADD COLUMN IF NOT EXISTS pesticide_result text;
