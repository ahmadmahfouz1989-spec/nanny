-- Delivery dispatch that knows where riders are (see src/lib/errand-orders.ts):
--
-- * rider_locations: where an Available rider's phone was a few minutes ago,
--   rounded to about 500 m, sent while the app is open. Private: no policies,
--   so only the server (service role) reads or writes it -- never another user.
-- * auto_offline_after_misses: a rider who lets this many requests in a row
--   run out is switched Offline (0 = never).
-- * location_fresh_minutes: how old a position may be and still count.
-- * travel_time_candidates: how many of the nearest riders get a road travel
--   time from Google before the wave is picked (0 = straight lines only;
--   also off without GOOGLE_MAPS_SERVER_KEY).

create table if not exists public.rider_locations (
  profile_id uuid primary key references public.generic_profiles(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  located_at timestamptz not null default now()
);
alter table public.rider_locations enable row level security;
revoke all on public.rider_locations from anon, authenticated;
grant select, insert, update, delete on public.rider_locations to service_role;

alter table public.errand_settings
  add column if not exists auto_offline_after_misses integer not null default 3 check (auto_offline_after_misses between 0 and 50),
  add column if not exists location_fresh_minutes integer not null default 20 check (location_fresh_minutes between 1 and 240),
  add column if not exists travel_time_candidates integer not null default 6 check (travel_time_candidates between 0 and 25);
