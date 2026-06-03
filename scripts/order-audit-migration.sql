-- ================================================================
-- YFF — Order audit trail (order_events)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run. Backfill runs only once (when order_events is empty).
--
-- Adds an append-only history of every order change. A trigger on
-- `orders` writes one row per changed status field, so the log captures
-- changes even when a row is edited directly in the Supabase dashboard.
--
-- "Who did it": app writes go through the service role, so the DB can't
-- tell a farmer from a rider on its own. API routes pass the real actor
-- by running `SET LOCAL app.actor_type = '...'` (and optionally
-- `app.actor_id`) in the same transaction as the UPDATE; the trigger
-- reads those. When unset (e.g. a dashboard edit), actor_type = 'system'.
-- ================================================================

-- 1. The audit table. Append-only by convention. Service-role only:
--    RLS is on with no policies, so the anon key can't read or write it.
CREATE TABLE IF NOT EXISTS order_events (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    uuid        NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- order_placed | status_change | payment_change | delivery_change | refund_change
  event_type  text        NOT NULL,
  from_status text,
  to_status   text,
  -- consumer | farmer | rider | admin | system
  actor_type  text        NOT NULL DEFAULT 'system',
  actor_id    uuid,
  note        text,
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_order_events_order_id   ON order_events(order_id);
CREATE INDEX IF NOT EXISTS idx_order_events_created_at ON order_events(created_at);

ALTER TABLE order_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE order_events IS
  'Append-only audit trail of order changes. Written by the orders trigger; service-role only.';

-- 2. Trigger function. Reads the acting user from session GUCs that the
--    API routes set (app.actor_type / app.actor_id); falls back to 'system'.
CREATE OR REPLACE FUNCTION public.log_order_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_type text;
  v_actor_id   uuid;
BEGIN
  v_actor_type := COALESCE(NULLIF(current_setting('app.actor_type', true), ''), 'system');
  BEGIN
    v_actor_id := NULLIF(current_setting('app.actor_id', true), '')::uuid;
  EXCEPTION WHEN others THEN
    v_actor_id := NULL;
  END;

  IF (TG_OP = 'INSERT') THEN
    INSERT INTO order_events (order_id, event_type, to_status, actor_type, actor_id, metadata)
    VALUES (
      NEW.id, 'order_placed', NEW.status,
      COALESCE(NULLIF(v_actor_type, 'system'), 'consumer'), v_actor_id,
      jsonb_build_object(
        'payment_method', NEW.payment_method,
        'delivery_type',  NEW.delivery_type,
        'total_price',    NEW.total_price
      )
    );
    RETURN NEW;
  END IF;

  -- UPDATE: emit one row per tracked field that actually changed.
  IF (NEW.status IS DISTINCT FROM OLD.status) THEN
    INSERT INTO order_events (order_id, event_type, from_status, to_status, actor_type, actor_id, note)
    VALUES (NEW.id, 'status_change', OLD.status, NEW.status, v_actor_type, v_actor_id,
            CASE WHEN NEW.status = 'declined' THEN NEW.decline_reason END);
  END IF;

  IF (NEW.payment_status IS DISTINCT FROM OLD.payment_status) THEN
    INSERT INTO order_events (order_id, event_type, from_status, to_status, actor_type, actor_id)
    VALUES (NEW.id, 'payment_change', OLD.payment_status, NEW.payment_status, v_actor_type, v_actor_id);
  END IF;

  IF (NEW.delivery_status IS DISTINCT FROM OLD.delivery_status) THEN
    INSERT INTO order_events (order_id, event_type, from_status, to_status, actor_type, actor_id)
    VALUES (NEW.id, 'delivery_change', OLD.delivery_status, NEW.delivery_status, v_actor_type, v_actor_id);
  END IF;

  IF (NEW.refund_status IS DISTINCT FROM OLD.refund_status) THEN
    INSERT INTO order_events (order_id, event_type, from_status, to_status, actor_type, actor_id, metadata)
    VALUES (NEW.id, 'refund_change', OLD.refund_status, NEW.refund_status, v_actor_type, v_actor_id,
            jsonb_build_object('refund_amount', NEW.refund_amount, 'refund_id', NEW.refund_id));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_order_events_insert ON orders;
CREATE TRIGGER trg_order_events_insert
  AFTER INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION log_order_event();

DROP TRIGGER IF EXISTS trg_order_events_update ON orders;
CREATE TRIGGER trg_order_events_update
  AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION log_order_event();

-- 3. One-time backfill for the 43 existing orders. Synthesizes an
--    approximate history from the timestamp columns we already store.
--    Guarded so re-running the migration won't duplicate events.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM order_events) THEN
    -- Order placed
    INSERT INTO order_events (order_id, event_type, to_status, actor_type, created_at)
    SELECT id, 'order_placed', status, 'system', created_at
    FROM orders;

    -- Final order status for anything past 'pending'
    INSERT INTO order_events (order_id, event_type, to_status, actor_type, note, created_at)
    SELECT id, 'status_change', status, 'system', decline_reason,
           COALESCE(refunded_at, delivered_at, created_at)
    FROM orders
    WHERE status IS DISTINCT FROM 'pending';

    -- Delivery milestones, from per-stage timestamps
    INSERT INTO order_events (order_id, event_type, to_status, actor_type, created_at)
    SELECT id, 'delivery_change', 'assigned', 'system', assigned_at
    FROM orders WHERE assigned_at IS NOT NULL;

    INSERT INTO order_events (order_id, event_type, to_status, actor_type, created_at)
    SELECT id, 'delivery_change', 'picked_up', 'system', picked_up_at
    FROM orders WHERE picked_up_at IS NOT NULL;

    INSERT INTO order_events (order_id, event_type, to_status, actor_type, created_at)
    SELECT id, 'delivery_change', 'out_for_delivery', 'system', out_for_delivery_at
    FROM orders WHERE out_for_delivery_at IS NOT NULL;

    INSERT INTO order_events (order_id, event_type, to_status, actor_type, created_at)
    SELECT id, 'delivery_change', 'delivered', 'system', delivered_at
    FROM orders WHERE delivered_at IS NOT NULL;

    -- Refunds
    INSERT INTO order_events (order_id, event_type, to_status, actor_type, metadata, created_at)
    SELECT id, 'refund_change', refund_status, 'system',
           jsonb_build_object('refund_amount', refund_amount, 'refund_id', refund_id),
           COALESCE(refunded_at, created_at)
    FROM orders WHERE refund_status IS NOT NULL;
  END IF;
END $$;
