-- Moderator-led farmer onboarding.
--
-- Tracks who onboarded a farmer, a shareable one-time activation code, and the
-- farmer's bank payout details. soil_organic_carbon already exists on farmers,
-- so it is not added here.
--
-- Applied to Supabase via migration `farmers_moderator_registration`.

alter table public.farmers
  add column if not exists activation_code text,
  add column if not exists registered_by_moderator uuid references public.moderators(id),
  add column if not exists bank_account_number text,
  add column if not exists bank_ifsc text;

-- Activation codes are unique (where set) so a farmer can be looked up by code.
create unique index if not exists farmers_activation_code_key
  on public.farmers (activation_code) where activation_code is not null;

-- Fast "farmers I registered" lookups for the moderator's my-farmers list.
create index if not exists farmers_registered_by_moderator_idx
  on public.farmers (registered_by_moderator);

comment on column public.farmers.activation_code is 'One-time code (YFF-XXXX) shown to a moderator-registered farmer to share for login activation';
comment on column public.farmers.registered_by_moderator is 'Moderator (moderators.id) who onboarded this farmer on their behalf';
