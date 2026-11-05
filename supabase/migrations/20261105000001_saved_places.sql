-- A customer's places, so a delivery's pickup or drop-off is one tap: Home
-- and Work (one of each, saved by them) and their recent places (kept from
-- the orders they place, the last few). Only the place itself: never an
-- order's contact names or phone numbers.
--
-- Server-only like the order tables: RLS on and no client policies; the
-- /api/saved-places route answers for the signed-in user alone.

create table public.saved_places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('home', 'work', 'recent')),
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  address text check (char_length(address) <= 300),
  name text check (char_length(name) <= 160),
  updated_at timestamptz not null default now()
);

create index saved_places_user_idx on public.saved_places(user_id, updated_at desc);

-- One Home and one Work per person; recents are limited by the app.
create unique index saved_places_one_home_work on public.saved_places(user_id, kind)
  where kind in ('home', 'work');

alter table public.saved_places enable row level security;
grant select, insert, update, delete on public.saved_places to service_role;
