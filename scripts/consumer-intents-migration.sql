-- Card #7: let a consumer see / edit / remove their own raised demand intents.
-- Links each demand_intents row to the consumer who created it. Safe to re-run.
ALTER TABLE demand_intents ADD COLUMN IF NOT EXISTS consumer_id uuid;
CREATE INDEX IF NOT EXISTS demand_intents_consumer_id_idx ON demand_intents (consumer_id);

-- NOTE: if/when RLS is enabled on demand_intents, scope consumer reads/updates/
-- deletes to their own rows, e.g.:
--   USING (consumer_id = auth.uid())  -- adapt to the consumer auth scheme
