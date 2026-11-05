-- One account, one identity. The name moves up to the account and profiles
-- keep a synced copy: users is readable only by its owner, while profiles
-- are what other people see, so every screen keeps reading the profile.
-- Nothing already on a profile is rewritten here: a person whose profiles
-- differ converges the next time they save their name.

-- ─── 1. The account's name ─────────────────────────────────────────────
alter table public.users
  add column full_name text check (char_length(full_name) between 2 and 80);

update public.users u
set full_name = latest.full_name
from (
  select distinct on (user_id) user_id, full_name
  from public.generic_profiles
  where status <> 'draft' and full_name <> 'Draft profile'
  order by user_id, updated_at desc
) latest
where latest.user_id = u.id;

-- ─── 2. Account name -> every profile ──────────────────────────────────
-- A changed name is reviewed again, like any other profile edit. A draft
-- has nothing public yet, so it only takes the name.
create or replace function public.sync_account_name_to_profiles()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.full_name is null then
    return new;
  end if;
  update public.generic_profiles
  set full_name = new.full_name,
      moderation_status = case when status = 'draft' then moderation_status else 'pending' end
  where user_id = new.id
    and full_name is distinct from new.full_name;
  return new;
end;
$$;

create trigger users_sync_name_to_profiles
  after update of full_name on public.users
  for each row
  when (old.full_name is distinct from new.full_name)
  execute function public.sync_account_name_to_profiles();

-- ─── 3. A name saved on a profile -> the account ───────────────────────
-- Covers every path that writes a profile. Fires only when a name was
-- really given (a new or changed name, or a draft being submitted), never
-- on pausing or moderating, so a profile with an older name can't overwrite
-- the account's name just by being switched on and off.
create or replace function public.sync_profile_name_to_account()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'draft' or new.full_name = 'Draft profile' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.full_name is not distinct from old.full_name and old.status <> 'draft' then
    return new;
  end if;
  update public.users
  set full_name = new.full_name
  where id = new.user_id
    and full_name is distinct from new.full_name;
  return new;
end;
$$;

create trigger generic_profiles_sync_name_to_account
  after insert or update of full_name, status on public.generic_profiles
  for each row execute function public.sync_profile_name_to_account();

-- ─── 4. Verified phone or email added later -> users ───────────────────
-- users was only ever written at sign-up. auth.users is the source of
-- truth and already refuses a phone or email another account holds.
-- A sign-up is untouched: its phone and email arrive on insert.
-- Never blocks Supabase Auth: a clash with an old row is left as a warning.
create or replace function public.sync_auth_identity_to_users()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.phone is distinct from old.phone and new.phone is not null and new.phone_confirmed_at is not null then
    update public.users set phone = new.phone, phone_verified_at = new.phone_confirmed_at where id = new.id;
  end if;
  if new.email is distinct from old.email and new.email is not null and new.email_confirmed_at is not null then
    update public.users set email = new.email, email_verified_at = new.email_confirmed_at where id = new.id;
  end if;
  return new;
exception when others then
  raise warning 'sync_auth_identity_to_users: % for user %', sqlerrm, new.id;
  return new;
end;
$$;

create trigger on_auth_user_identity_changed
  after update on auth.users
  for each row
  when (old.phone is distinct from new.phone or old.email is distinct from new.email)
  execute function public.sync_auth_identity_to_users();

-- The guard on users must let that sync through. session_user is the
-- database login, which an API caller can't change: only Supabase Auth
-- itself connects as supabase_auth_admin.
create or replace function public.protect_user_role_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or session_user = 'supabase_auth_admin' then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'role cannot be changed by the account owner';
  end if;
  if new.status is distinct from old.status then
    raise exception 'status cannot be changed by the account owner';
  end if;
  if new.featured_until is distinct from old.featured_until then
    raise exception 'featured_until is managed by admins only';
  end if;
  if new.email is distinct from old.email then
    raise exception 'email is managed by the auth system only';
  end if;
  if new.phone is distinct from old.phone then
    raise exception 'phone is managed by the verification flow only';
  end if;
  if new.email_verified_at is distinct from old.email_verified_at then
    raise exception 'email_verified_at cannot be set by the account owner';
  end if;
  if new.phone_verified_at is distinct from old.phone_verified_at then
    raise exception 'phone_verified_at cannot be set by the account owner';
  end if;
  return new;
end;
$$;
