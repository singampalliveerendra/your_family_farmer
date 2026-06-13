-- ================================================================
-- YFF — Universal audit log (audit_log)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run.
--
-- Records every create / edit / delete on the core business tables so
-- the team can trace "who changed what, when" when investigating an
-- issue. Like order_events, this is enforced by DB triggers rather than
-- application code, so it captures changes no matter the path:
--   • a farmer editing their profile or produce from the browser
--     (anon key, client-side),
--   • a moderator acting through /api/moderator/* (service role),
--   • a direct edit in the Supabase dashboard.
--
-- Orders already have their own richer trail (order_events), so this
-- log intentionally does NOT cover the `orders` table — the two would
-- only duplicate each other.
--
-- "Who did it": app writes use the service/anon role, so the DB cannot
-- by itself tell a farmer from a moderator. When a server route wants to
-- attribute an action it runs, in the same statement batch:
--     select set_config('app.actor_type', 'moderator', true);
--     select set_config('app.actor_id',   '<uuid>',     true);
-- and the trigger records those. When unset, actor_type = 'system'.
-- ================================================================

-- 1. The log table. Append-only by convention. Service-role only:
--    RLS is on with no policies, so the anon (browser) key cannot read
--    or write it — all reads go through /api/moderator/audit.
CREATE TABLE IF NOT EXISTS audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name  text        NOT NULL,
  record_id   uuid,
  -- insert | update | delete
  action      text        NOT NULL,
  -- consumer | farmer | moderator | rider | admin | system
  actor_type  text        NOT NULL DEFAULT 'system',
  actor_id    uuid,
  -- For update: { col: { old, new } } of changed columns.
  -- For insert/delete: a redacted snapshot of the row.
  changes     jsonb,
  -- Best-effort zone, copied from the row's region_slug when it has one,
  -- so the moderator audit view can scope to its own zone.
  region_slug text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_table_record ON audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at   ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_zone         ON audit_log(region_slug);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE audit_log IS
  'Append-only audit of create/edit/delete on core tables. Written by triggers; service-role only.';

-- 2. Generic trigger function. Works for any table that has an `id`
--    column. Strips secret/noise columns from the recorded snapshot, and
--    on UPDATE records only the columns that actually changed (so a
--    no-op save writes nothing).
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_type text;
  v_actor_id   uuid;
  v_old        jsonb;
  v_new        jsonb;
  v_changes    jsonb;
  v_record_id  uuid;
  v_region     text;
  -- Never log secrets or pure-noise columns.
  v_skip       text[] := ARRAY['password_hash', 'password', 'updated_at'];
BEGIN
  v_actor_type := COALESCE(NULLIF(current_setting('app.actor_type', true), ''), 'system');
  BEGIN
    v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  EXCEPTION WHEN others THEN
    v_actor_id := NULL;
  END;

  IF (TG_OP = 'DELETE') THEN
    v_old := to_jsonb(OLD) - v_skip;
    v_record_id := NULLIF(v_old->>'id', '')::uuid;
    v_region := v_old->>'region_slug';
    INSERT INTO audit_log (table_name, record_id, action, actor_type, actor_id, changes, region_slug)
    VALUES (TG_TABLE_NAME, v_record_id, 'delete', v_actor_type, v_actor_id, v_old, v_region);
    RETURN OLD;

  ELSIF (TG_OP = 'INSERT') THEN
    v_new := to_jsonb(NEW) - v_skip;
    v_record_id := NULLIF(v_new->>'id', '')::uuid;
    v_region := v_new->>'region_slug';
    INSERT INTO audit_log (table_name, record_id, action, actor_type, actor_id, changes, region_slug)
    VALUES (TG_TABLE_NAME, v_record_id, 'insert', v_actor_type, v_actor_id, v_new, v_region);
    RETURN NEW;

  ELSE -- UPDATE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    -- Build { col: { old, new } } for every column whose value changed,
    -- excluding the skip list.
    SELECT jsonb_object_agg(n.key, jsonb_build_object('old', v_old -> n.key, 'new', n.value))
      INTO v_changes
      FROM jsonb_each(v_new) AS n
      WHERE (v_old -> n.key) IS DISTINCT FROM n.value
        AND NOT (n.key = ANY (v_skip));

    -- Nothing meaningful changed → don't write a row.
    IF v_changes IS NULL THEN
      RETURN NEW;
    END IF;

    v_record_id := NULLIF(v_new->>'id', '')::uuid;
    v_region := v_new->>'region_slug';
    INSERT INTO audit_log (table_name, record_id, action, actor_type, actor_id, changes, region_slug)
    VALUES (TG_TABLE_NAME, v_record_id, 'update', v_actor_type, v_actor_id, v_changes, v_region);
    RETURN NEW;
  END IF;
END;
$$;

-- 3. Attach the trigger to each core table. `orders` is intentionally
--    excluded (see header). Re-running drops and recreates cleanly.
DO $$
DECLARE
  t text;
  audited_tables text[] := ARRAY[
    'farmers',
    'produce_listings',
    'escalations',
    'consumers_auth',
    'demand_intents',
    'reviews'
  ];
BEGIN
  FOREACH t IN ARRAY audited_tables LOOP
    -- Skip any table that doesn't exist in this database yet.
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = t) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON %1$I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%1$s
           AFTER INSERT OR UPDATE OR DELETE ON %1$I
           FOR EACH ROW EXECUTE FUNCTION log_audit_event()', t);
    END IF;
  END LOOP;
END $$;
