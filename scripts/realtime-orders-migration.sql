-- Live order status (farmer + consumer): make the DB broadcast order changes.
--
-- The app already subscribes to realtime on the `orders` table, but the
-- `supabase_realtime` publication had NO tables in it, so no change events were
-- ever delivered — the UI only updated on manual refresh / tab focus. Adding
-- `orders` to the publication turns on live updates for every subscriber.
--
-- REPLICA IDENTITY FULL makes UPDATE/DELETE events carry the full row so the
-- client-side filters (consumer_id / id) match reliably on updates, not just
-- inserts. Safe to run once per environment (staging AND production).
--
-- Safe/idempotent: skips the ADD if orders is already in the publication.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'orders'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
  END IF;
END $$;

ALTER TABLE public.orders REPLICA IDENTITY FULL;
