-- Native push for the iOS and Android apps (mobile/): one row per app
-- install that allowed notifications. `token` is the APNs device token on
-- iOS and the FCM registration token on Android. Like push_subscriptions,
-- written and read only by the server (service role): RLS on, no policies.
-- `locale` is the app language on that device when it registered.

create table public.native_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token text not null unique,
  platform text not null check (platform in ('ios', 'android')),
  locale text not null default 'en' check (locale in ('en', 'ar')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index native_push_tokens_user_idx on public.native_push_tokens(user_id);

alter table public.native_push_tokens enable row level security;

grant select, insert, update, delete on public.native_push_tokens to service_role;
