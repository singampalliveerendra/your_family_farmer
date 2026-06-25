-- Add City/Town to the delivery location captured at checkout (home delivery /
-- farmer courier), alongside the existing door/street address, landmark and
-- pincode. Applied to Supabase project bzwczufnlqwlirtrccwr on 2026-06-25.
alter table public.orders add column if not exists delivery_city text;
