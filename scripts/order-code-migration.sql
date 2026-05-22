-- ================================================================
-- YFF Order Code migration  (feature #4 — Readable Order IDs)
-- Run in: Supabase Dashboard → SQL Editor → New Query → Run
-- Safe to re-run (idempotent).
-- ================================================================
--
-- Gives every order row a human-readable code like  YFF-20260522-0001
-- shown to buyers and farmers everywhere. The number comes from a
-- database sequence, so it is unique and race-free even when a cart
-- inserts several rows at once. Note: the counter does NOT reset daily
-- (like an invoice number) — that keeps it collision-proof.

-- 1. Sequence that produces the running number.
CREATE SEQUENCE IF NOT EXISTS order_code_seq;

-- 2. The column itself.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_code text;

-- 3. Trigger function: stamp a code on every new row that lacks one.
--    Date is taken in India time (Asia/Kolkata) so it matches the day
--    the buyer actually placed the order.
CREATE OR REPLACE FUNCTION set_order_code() RETURNS trigger AS $$
BEGIN
  IF NEW.order_code IS NULL THEN
    NEW.order_code := 'YFF-'
      || to_char((now() AT TIME ZONE 'Asia/Kolkata'), 'YYYYMMDD')
      || '-'
      || lpad(nextval('order_code_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_order_code ON orders;
CREATE TRIGGER trg_set_order_code
  BEFORE INSERT ON orders
  FOR EACH ROW EXECUTE FUNCTION set_order_code();

-- 4. Backfill existing orders, in creation order, using each order's own
--    created_at for the date part.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id, created_at FROM orders WHERE order_code IS NULL ORDER BY created_at LOOP
    UPDATE orders
      SET order_code = 'YFF-'
        || to_char((COALESCE(r.created_at, now()) AT TIME ZONE 'Asia/Kolkata'), 'YYYYMMDD')
        || '-'
        || lpad(nextval('order_code_seq')::text, 4, '0')
      WHERE id = r.id;
  END LOOP;
END $$;

-- 5. Enforce uniqueness.
CREATE UNIQUE INDEX IF NOT EXISTS orders_order_code_key ON orders(order_code);
