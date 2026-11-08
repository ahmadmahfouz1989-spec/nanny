-- An approved provider's edits no longer take their profile offline until
-- an admin re-approves it: it stays live and admins are told to check the
-- change (they can still take it down). New and rejected profiles are
-- reviewed as before -- the app sets those to 'pending' itself.

-- A changed account name leaves every profile's status as it is.
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
  set full_name = new.full_name
  where user_id = new.id
    and full_name is distinct from new.full_name;
  return new;
end;
$$;

-- Anyone's own write may leave the status as it is -- on the same profile:
-- not when it turns a customer's request into a provider profile (or moves
-- it to another service), which would carry an approval it never had.
-- Otherwise only 'pending': approving and rejecting stay with admins.
-- to_jsonb because the legacy profile tables have no role or category.
create or replace function public.protect_moderation_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if tg_op = 'UPDATE'
    and new.moderation_status = old.moderation_status
    and to_jsonb(new)->>'role' is not distinct from to_jsonb(old)->>'role'
    and to_jsonb(new)->>'category_id' is not distinct from to_jsonb(old)->>'category_id' then
    return new;
  end if;
  if new.moderation_status <> 'pending' then
    raise exception 'moderation_status can only be set to approved/rejected by an admin';
  end if;
  return new;
end;
$$;
