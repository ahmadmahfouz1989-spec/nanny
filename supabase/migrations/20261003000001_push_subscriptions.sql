-- Web push: one row per browser/device a user has turned notifications on
-- for. Written and read only by the server (service role) -- the API route
-- authenticates the user and the push sender needs every recipient's rows
-- -- so RLS is on with no policies, which locks out anon/authenticated.
-- `locale` is the app language on that device when it subscribed, so the
-- push text matches what the person reads in the app there.

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  locale text not null default 'en' check (locale in ('en', 'ar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

grant select, insert, update, delete on public.push_subscriptions to service_role;
