-- Reschedule reason for fulfilment date changes.
--
-- Once a farmer has APPROVED an order, the pickup/delivery date is locked. If
-- the farmer needs to move it, they must give a reason — which the buyer then
-- sees on their order, so a date change is never silent. These columns store
-- that reason and when the date was last changed.
--
-- Safe to run more than once.
alter table public.orders
  add column if not exists reschedule_reason text,
  add column if not exists rescheduled_at timestamptz;
