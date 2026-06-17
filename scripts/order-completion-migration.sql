-- Order completion flow: courier self-ship + pickup completion timestamps.
--
-- Adds the two new milestone columns the completion flow needs:
--   shipped_at  — farmer marked a COURIER order shipped (parcel handed over)
--   received_at — consumer confirmed they received a shipped courier order
--
-- Pickup completion deliberately reuses the existing `collected_at` column
-- (it already means "buyer collected"), and the rider home-delivery flow keeps
-- using `delivered_at` — neither is touched here.
--
-- The `courier` delivery_type is a new value stored on orders.delivery_type;
-- no enum/constraint exists on that column, so no type change is required.

alter table public.orders
  add column if not exists shipped_at  timestamptz,
  add column if not exists received_at timestamptz;

comment on column public.orders.shipped_at  is 'When the farmer marked a courier order shipped';
comment on column public.orders.received_at is 'When the buyer confirmed receipt of a shipped courier order';
