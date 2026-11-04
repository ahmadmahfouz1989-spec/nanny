-- Delivery & Errands, Phase 2 of "smart nearby matching": waves, timers
-- and a widening search radius (Home Maintenance quotes are unchanged).
--
-- An order goes to the nearest `wave_size` eligible providers within
-- `radius_km` of the pickup. They have `response_seconds` to offer or
-- decline. When the time is up (or all have answered):
--   * offers came in -> the customer has `choose_seconds` to pick one;
--     if they don't, those offers lapse and the next wave goes out;
--   * no offers      -> the next wave goes out, widening the radius by
--     `radius_step_km` (up to `max_radius_km`) when nobody is left inside.
-- A chosen provider has `confirm_seconds` to confirm; if they don't, the
-- reservation lapses and matching carries on. With nobody left, the order
-- closes as "no provider".
--
-- The deadlines live on the order; lib/errand-orders.ts (tickOrder) moves
-- an order on once one has passed. It runs whenever an order is read and
-- from /api/cron/errand-orders, so nothing here needs a scheduler.

-- ─── settings, edited from the admin dashboard ──────────────────────────
alter table public.errand_settings
  add column wave_size integer not null default 3 check (wave_size between 1 and 50),
  add column response_seconds integer not null default 120 check (response_seconds between 30 and 3600),
  add column choose_seconds integer not null default 60 check (choose_seconds between 30 and 3600),
  add column confirm_seconds integer not null default 60 check (confirm_seconds between 30 and 3600),
  add column initial_radius_km numeric(5, 1) not null default 5 check (initial_radius_km > 0 and initial_radius_km <= 300),
  add column radius_step_km numeric(5, 1) not null default 5 check (radius_step_km > 0 and radius_step_km <= 300),
  add column max_radius_km numeric(5, 1) not null default 30 check (max_radius_km > 0 and max_radius_km <= 300),
  -- Orders a rider may have in progress at once (1 = never overlapping).
  add column max_active_orders integer not null default 1 check (max_active_orders between 1 and 10);
alter table public.errand_settings
  add constraint errand_settings_radius_check check (max_radius_km >= initial_radius_km);

-- ─── where each order is in its matching ────────────────────────────────
alter table public.errand_orders
  -- 0 = not sent yet; 1 = the first wave went out; ...
  add column wave integer not null default 0,
  -- The current wave's providers answer by then.
  add column wave_until timestamptz,
  -- How far out the search reaches now.
  add column radius_km numeric(5, 1),
  -- Set while the customer is choosing between the offers that came in.
  add column choose_until timestamptz,
  -- Set while the order is reserved: the chosen provider confirms by then.
  add column confirm_until timestamptz;

-- Orders already open keep their Phase 1 life: one wave lasting until
-- they close, so nobody already asked is cut off when this goes live.
update public.errand_orders
   set wave = 1, wave_until = open_until
 where status = 'open' and category = 'errands';

create index errand_orders_due_idx on public.errand_orders(status)
  where status in ('open', 'reserved');

alter table public.errand_order_recipients
  add column wave integer not null default 1;

alter table public.errand_order_recipients drop constraint errand_order_recipients_status_check;
alter table public.errand_order_recipients add constraint errand_order_recipients_status_check check (status in (
  'sent',          -- received, no answer yet
  'offered',       -- sent a price and time
  'declined',      -- said no
  'selected',      -- the customer picked this offer
  'not_selected',  -- the customer picked someone else
  'withdrawn',     -- the provider took their offer back
  'refused',       -- picked, but the provider didn't (or couldn't) confirm
  'expired',       -- didn't answer in time
  'offer_expired'  -- offered, but the customer didn't choose in time
));

-- ─── how many orders a rider can have at once ───────────────────────────
-- Replaces the one-active-order unique index with a check against
-- errand_settings.max_active_orders. Locking the provider's profile row
-- makes two confirmations at the same moment take turns, so the limit
-- holds even then. Raised as a unique violation (23505), as before.
drop index public.errand_orders_one_active_per_provider;

create or replace function public.errand_orders_check_provider_load()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  busy_statuses constant text[] := array['accepted', 'on_the_way', 'arrived', 'picked_up'];
  limit_count integer;
  active_count integer;
begin
  if new.category <> 'errands' or new.provider_profile_id is null or not (new.status = any (busy_statuses)) then
    return new;
  end if;
  -- Moving along its own stages doesn't add an order.
  if tg_op = 'UPDATE' and old.status = any (busy_statuses) and old.provider_profile_id is not distinct from new.provider_profile_id then
    return new;
  end if;

  perform 1 from public.generic_profiles where id = new.provider_profile_id for update;
  select max_active_orders into limit_count from public.errand_settings where id;
  select count(*) into active_count
    from public.errand_orders
   where provider_profile_id = new.provider_profile_id
     and category = 'errands'
     and status = any (busy_statuses)
     and id <> new.id;
  if active_count >= coalesce(limit_count, 1) then
    raise exception 'provider already has % order(s) in progress', active_count using errcode = '23505';
  end if;
  return new;
end;
$$;

revoke all on function public.errand_orders_check_provider_load() from public, anon, authenticated;

create trigger errand_orders_check_provider_load
  before insert or update of status, provider_profile_id on public.errand_orders
  for each row execute function public.errand_orders_check_provider_load();
