-- A team, company, salon or garage (cleaning, beauty, car) goes by its business name,
-- not the person's: that name stays on its own profile. Before this, saving
-- "Sparkle Cleaning" renamed the account, and through it every other
-- profile of that person; and renaming the account renamed the business.

create or replace function public.is_business_profile(attributes jsonb)
returns boolean
language sql
immutable
as $$
  select coalesce(attributes->>'providerType', '') in ('team', 'company', 'salon', 'garage');
$$;

-- Account name -> every profile, except a business's own name.
create or replace function public.sync_account_name_to_profiles()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.full_name is null then
    return new;
  end if;
  -- As in 20261108000002: a live profile stays live (admins check edits after).
  update public.generic_profiles
  set full_name = new.full_name
  where user_id = new.id
    and full_name is distinct from new.full_name
    and not public.is_business_profile(attributes);
  return new;
end;
$$;

-- A name saved on a profile -> the account, unless it's a business name.
create or replace function public.sync_profile_name_to_account()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'draft' or new.full_name = 'Draft profile' then
    return new;
  end if;
  if public.is_business_profile(new.attributes) then
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
