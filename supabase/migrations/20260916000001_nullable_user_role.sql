-- Nursing (and future categories) key role off generic_profiles.role, not
-- users.role, since one account can now hold a profile per category.
-- Signup stops forcing a parent/nanny choice up front, so a brand-new
-- account may have no nanny-track role at all until it visits that category.

alter table public.users alter column role drop not null;

alter table public.users drop constraint users_role_check;
alter table public.users add constraint users_role_check
  check (role is null or role in ('parent', 'nanny', 'admin'));

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data->>'role';
begin
  -- signup metadata is client-controlled; never allow self-provisioned admin
  -- accounts, and never invent a role the client didn't ask for.
  if requested_role is not null and requested_role not in ('parent', 'nanny') then
    requested_role := null;
  end if;

  insert into public.users (id, role, email, phone, preferred_language)
  values (
    new.id,
    requested_role,
    new.email,
    coalesce(new.phone, new.raw_user_meta_data->>'phone'),
    coalesce(new.raw_user_meta_data->>'preferred_language', 'en')
  );
  return new;
end;
$$;

-- protect_user_role_status used `<>`, which is NULL (not TRUE) when either
-- side is null -- so once role can be null, a client could silently change
-- their own role from null to 'nanny' (or worse) without tripping the
-- exception below. `is distinct from` treats null correctly as a value.
create or replace function public.protect_user_role_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.role is distinct from old.role then
    raise exception 'role cannot be changed by the account owner';
  end if;
  if new.status is distinct from old.status then
    raise exception 'status cannot be changed by the account owner';
  end if;
  return new;
end;
$$;
