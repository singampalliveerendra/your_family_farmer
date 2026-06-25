-- Fix: "Add Farm Photo" did nothing — uploaded files saved to storage but the
-- media row never persisted, so photos were invisible in the farmer dashboard
-- and on the public farmer profile.
--
-- Cause: public.media had RLS enabled with ONLY a SELECT policy ("Public read
-- media"). The farmer dashboard uses the anon client (localStorage auth), so its
-- INSERT was silently rejected by RLS and no media row was created.
--
-- Fix: add the same permissive write policies already used on produce_listings.
-- Applied to Supabase project bzwczufnlqwlirtrccwr on 2026-06-25.

drop policy if exists "Allow insert media" on public.media;
create policy "Allow insert media" on public.media
  for insert to anon
  with check (true);

drop policy if exists "media public update" on public.media;
create policy "media public update" on public.media
  for update
  using (true)
  with check (true);

drop policy if exists "media public delete" on public.media;
create policy "media public delete" on public.media
  for delete
  using (true);
