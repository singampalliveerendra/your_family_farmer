-- ONE-OFF PROD FIX (2026-11-03) — YFF-20261029-0383, Suresh L, Bellam 1 kg ₹135.
-- Cashfree took the money (UPI, 29 Oct 12:57, settled 30 Oct) but our abandon
-- call had already cancelled the order as "Payment not completed".
-- No refund. The farmer has already sent the produce, so we move the order to
-- Approved + Shipped. The buyer then taps "Mark as Delivered" / "Mark as
-- Picked up" on their Orders page to confirm they received it.
-- Run in the PROD Supabase SQL editor.

-- STEP 1 — look first. Expect exactly 1 row with status = cancelled.
-- payment_status should be paid (the webhook records it). If it is still
-- pending/failed, STEP 2 sets it from the Cashfree screen (txn 6862236548).
select id, order_code, status, payment_status, payment_method, delivery_type,
       decline_reason, cashfree_payment_id, paid_at, shipped_at, received_at,
       collected_at, acknowledged_at, quantity, harvest_id, produce_listing_id
from orders
where order_code = 'YFF-20261029-0383';

-- STEP 2 — the fix. All or nothing.
begin;

-- Abandon put the 1 kg back into stock; it was really sold, so take it out again.
update harvests h
set stock_qty = greatest(h.stock_qty - o.quantity, 0)
from orders o
where o.order_code = 'YFF-20261029-0383'
  and o.status = 'cancelled'
  and o.harvest_id = h.id;

update produce_listings p
set stock_qty = greatest(p.stock_qty - o.quantity, 0)
from orders o
where o.order_code = 'YFF-20261029-0383'
  and o.status = 'cancelled'
  and o.harvest_id is null
  and o.produce_listing_id = p.id;

-- Cancelled → Approved + Shipped. received_at / collected_at stay empty so the
-- buyer gets the confirm button. Guarded so it only touches this exact row.
update orders
set status          = 'approved',
    decline_reason  = null,
    acknowledged_at = null,
    confirmed_at    = coalesce(confirmed_at, now()),
    shipped_at      = coalesce(shipped_at, now()),
    payment_status  = 'paid',
    paid_at         = coalesce(paid_at, '2026-10-29 12:57:37+05:30'),
    cashfree_payment_id = coalesce(cashfree_payment_id, '6862236548')
where order_code = 'YFF-20261029-0383'
  and status = 'cancelled'
  and payment_status in ('paid', 'pending', 'failed')
returning id, order_code, status, payment_status, shipped_at, received_at, collected_at;

-- Expect 1 row returned above. If 0 rows: run `rollback;` instead of commit.
commit;
