-- Paid access: both parents and nannies can browse and see matches for
-- free, but expressing interest, messaging, and viewing contact details
-- require an active subscription. Payment is collected out of band (Whish
-- transfer to the operator); an admin then activates the account for a
-- month or a year from the admin console. No payment provider integration.

alter table public.users add column subscribed_until timestamptz;

-- History of every activation, for reconciling against Whish payments.
create table public.subscription_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan text not null check (plan in ('monthly', 'yearly')),
  granted_by uuid references public.users(id),
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  note text check (char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create index subscription_grants_user_idx on public.subscription_grants(user_id, created_at desc);

alter table public.subscription_grants enable row level security;

-- A user can see their own activation history; all writes are service-role
-- (the admin route).
create policy subscription_grants_select_own on public.subscription_grants
  for select using (user_id = auth.uid());

grant select on public.subscription_grants to authenticated;
grant select, insert, update, delete on public.subscription_grants to service_role;

-- users_update_own (RLS) lets the account owner update their own row, so
-- subscribed_until has to be locked the same way role/status already are.
create or replace function public.protect_user_role_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.role <> old.role then
    raise exception 'role cannot be changed by the account owner';
  end if;
  if new.status <> old.status then
    raise exception 'status cannot be changed by the account owner';
  end if;
  if new.subscribed_until is distinct from old.subscribed_until then
    raise exception 'subscribed_until is managed by admins only';
  end if;
  return new;
end;
$$;
