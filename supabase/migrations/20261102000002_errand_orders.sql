-- Delivery & Errands orders (Phase 1 of "smart nearby matching").
--
-- A customer posts an order; it goes at once to every available provider
-- who offers that service and covers the pickup district (nearest first,
-- capped by errand_settings.max_recipients). Providers answer with a price
-- and an estimated time, or decline. The customer picks one offer, the
-- provider confirms, and the order moves through its stages up to
-- completed. Waves and timers are Phase 2.
--
-- Every table is server-only: RLS on and no client policies. The API
-- routes (src/app/api/errand-orders) check who may see and change what,
-- and write with the service role.

-- ─── provider availability ──────────────────────────────────────────────
-- Available / offline is the provider's switch. Busy (an order in
-- progress) and suspended (users.status) are worked out, never stored.
alter table public.generic_profiles add column available_now boolean not null default false;
alter table public.generic_profiles add column available_changed_at timestamptz;

-- ─── settings, edited from the admin dashboard ──────────────────────────
create table public.errand_settings (
  id boolean primary key default true check (id),
  -- How many of the nearest eligible providers receive each order.
  max_recipients integer not null default 20 check (max_recipients between 1 and 200),
  -- How long an order stays open for offers before it closes as "no provider".
  open_minutes integer not null default 60 check (open_minutes between 5 and 1440),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.users(id) on delete set null
);
insert into public.errand_settings default values;

-- ─── orders ─────────────────────────────────────────────────────────────
create table public.errand_orders (
  id uuid primary key default gen_random_uuid(),
  -- The Order ID people read out ("#1042").
  number bigint generated always as identity unique,
  seeker_user_id uuid not null references public.users(id) on delete cascade,
  seeker_profile_id uuid references public.generic_profiles(id) on delete set null,
  service text not null check (service in ('delivery', 'paperwork', 'queue', 'shopping', 'moto_taxi')),
  description text not null check (char_length(description) between 3 and 1000),
  -- Where the provider starts: matching and distance are measured from here.
  pickup_district_id uuid not null references public.locations(id),
  pickup_area_id uuid references public.locations(id),
  pickup_detail text check (char_length(pickup_detail) <= 160),
  dropoff_district_id uuid references public.locations(id),
  dropoff_area_id uuid references public.locations(id),
  dropoff_detail text check (char_length(dropoff_detail) <= 160),
  timing text not null check (timing in ('asap', 'scheduled')),
  scheduled_at timestamptz,
  budget_usd numeric(10, 2) check (budget_usd >= 0),
  status text not null default 'open' check (status in (
    'open', 'reserved', 'accepted', 'on_the_way', 'arrived', 'picked_up',
    'delivered', 'completed', 'cancelled', 'no_provider'
  )),
  -- The provider once an offer is chosen (reserved) and confirmed.
  provider_profile_id uuid references public.generic_profiles(id) on delete set null,
  provider_user_id uuid references public.users(id) on delete set null,
  selected_recipient_id uuid,
  -- The conversation opened on confirmation, for addresses and details.
  generic_match_id uuid references public.generic_matches(id) on delete set null,
  open_until timestamptz not null,
  cancelled_by text check (cancelled_by in ('seeker', 'provider', 'admin', 'system')),
  cancel_reason text check (char_length(cancel_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_changed_at timestamptz not null default now()
);

create trigger errand_orders_set_updated_at
  before update on public.errand_orders
  for each row execute function public.set_updated_at();

create index errand_orders_seeker_idx on public.errand_orders(seeker_user_id, created_at desc);
create index errand_orders_provider_idx on public.errand_orders(provider_user_id, created_at desc);
create index errand_orders_status_idx on public.errand_orders(status, created_at desc);

-- One order in progress per provider at a time: a second confirmation
-- fails here even if two customers pick the same provider at once.
create unique index errand_orders_one_active_per_provider on public.errand_orders(provider_profile_id)
  where status in ('accepted', 'on_the_way', 'arrived', 'picked_up');

-- ─── who received each order, and what they answered ────────────────────
create table public.errand_order_recipients (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.errand_orders(id) on delete cascade,
  provider_profile_id uuid not null references public.generic_profiles(id) on delete cascade,
  provider_user_id uuid not null references public.users(id) on delete cascade,
  distance_km numeric(6, 1),
  -- 1 = nearest when it was sent.
  rank integer not null,
  status text not null default 'sent' check (status in (
    'sent',          -- received, no answer yet
    'offered',       -- sent a price and time
    'declined',      -- said no
    'selected',      -- the customer picked this offer
    'not_selected',  -- the customer picked someone else
    'withdrawn',     -- the provider took their offer back
    'refused'        -- picked, but the provider didn't confirm
  )),
  price_usd numeric(10, 2) check (price_usd > 0 and price_usd <= 10000),
  eta_minutes integer check (eta_minutes between 5 and 1440),
  note text check (char_length(note) <= 300),
  sent_at timestamptz not null default now(),
  responded_at timestamptz,
  unique (order_id, provider_profile_id)
);

create index errand_order_recipients_provider_idx on public.errand_order_recipients(provider_user_id, sent_at desc);

alter table public.errand_orders
  add constraint errand_orders_selected_recipient_fkey
  foreign key (selected_recipient_id) references public.errand_order_recipients(id) on delete set null;

-- ─── history, for the admin view of each order ──────────────────────────
create table public.errand_order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.errand_orders(id) on delete cascade,
  actor_user_id uuid references public.users(id) on delete set null,
  actor_role text not null check (actor_role in ('seeker', 'provider', 'admin', 'system')),
  type text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index errand_order_events_order_idx on public.errand_order_events(order_id, id);

-- ─── access: server only ────────────────────────────────────────────────
alter table public.errand_settings enable row level security;
alter table public.errand_orders enable row level security;
alter table public.errand_order_recipients enable row level security;
alter table public.errand_order_events enable row level security;

grant select, insert, update, delete on public.errand_settings to service_role;
grant select, insert, update, delete on public.errand_orders to service_role;
grant select, insert, update, delete on public.errand_order_recipients to service_role;
grant select, insert, update, delete on public.errand_order_events to service_role;

-- ─── notifications ──────────────────────────────────────────────────────
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'new_match','interest_received','interest_accepted','profile_approved',
  'profile_rejected','verification_updated','report_resolved','profile_pending_review',
  'rating_received','post_reply','post_like',
  'work_approved','work_rejected','work_pending_review',
  'errand_request','errand_offer','errand_selected','errand_confirmed',
  'errand_status','errand_cancelled','errand_no_provider'
));
