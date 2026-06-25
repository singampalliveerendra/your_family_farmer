-- Fix: farmer profile "Buyers" stat always showed 0. It read farmers.buyer_count,
-- a denormalized column that is never maintained. Orders are RLS-locked, so the
-- public profile (anon client) can't count buyers directly.
--
-- This SECURITY DEFINER function returns only the distinct-buyer count for a
-- farmer (registered consumers by id + guests by phone) — no order rows or PII
-- leave the database. The profile page calls it via rpc and overrides the stale
-- column, the same way it computes the live star-rating average.
-- Applied to Supabase project bzwczufnlqwlirtrccwr on 2026-06-25.

create or replace function public.farmer_buyer_count(p_farmer_id uuid)
returns integer
language sql
security definer
set search_path = public
stable
as $$
  select count(distinct coalesce(consumer_id::text, buyer_phone))::int
  from public.orders
  where farmer_id = p_farmer_id;
$$;

grant execute on function public.farmer_buyer_count(uuid) to anon, authenticated;
