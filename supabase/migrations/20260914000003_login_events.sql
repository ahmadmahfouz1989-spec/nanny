-- Login events: which country each sign-in came from, for the admin
-- panel. Private to the service role -- RLS is enabled with zero
-- policies, same pattern as verification/reports: no end-user should
-- ever see this, only admin routes going through the service role.

create table public.login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  ip text,
  country text,
  country_code text,
  city text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index login_events_user_idx on public.login_events(user_id, created_at desc);
create index login_events_created_idx on public.login_events(created_at desc);

alter table public.login_events enable row level security;

-- No grant to `authenticated` at all -- this table is service-role only,
-- written and read exclusively through admin-gated app routes. A brand
-- new table needs its own explicit service_role grant regardless of RLS
-- (RLS narrows rows, it doesn't substitute for the underlying grant) --
-- messages shipped without one earlier this project and needed a
-- follow-up migration to fix it, so this one ships with it from the start.
grant select, insert, update, delete on public.login_events to service_role;
