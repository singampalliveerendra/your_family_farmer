-- Card #7: let a consumer see / edit / remove their own raised demand intents.
-- Links each demand_intents row to the consumer who created it. Safe to re-run.
ALTER TABLE demand_intents ADD COLUMN IF NOT EXISTS consumer_id uuid;
CREATE INDEX IF NOT EXISTS demand_intents_consumer_id_idx ON demand_intents (consumer_id);

-- NOTE: if/when RLS is enabled on demand_intents, scope consumer reads/updates/
-- deletes to their own rows, e.g.:
--   USING (consumer_id = auth.uid())  -- adapt to the consumer auth scheme

-- RLS is enabled on demand_intents but only INSERT/SELECT policies existed, so
-- Edit/Remove from the anon client were silently blocked (0 rows, no error) and
-- the intent reappeared on refresh. Add UPDATE/DELETE policies matching the
-- existing permissive pattern; ownership is scoped app-side via
-- .eq('consumer_id', consumer.id). Safe to re-run.
DROP POLICY IF EXISTS "public update demand_intents" ON public.demand_intents;
CREATE POLICY "public update demand_intents" ON public.demand_intents
  FOR UPDATE TO public USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "public delete demand_intents" ON public.demand_intents;
CREATE POLICY "public delete demand_intents" ON public.demand_intents
  FOR DELETE TO public USING (true);
