-- Business model change: connecting (interest, messaging, contact) is now
-- free for everyone. Payment buys a "Featured" placement instead — a paid
-- profile shows in a Featured section at the top of the other side's
-- dashboard, independent of the match score. Reuses the same column/table,
-- renamed to match the new meaning; RLS/grants are unaffected by a rename.

alter table public.users rename column subscribed_until to featured_until;
alter table public.subscription_grants rename to featured_grants;

-- The rename above only changes the column's name, not the text of the
-- protect_user_role_status() function body -- Postgres stores plpgsql
-- bodies as text, so `new.subscribed_until` would raise "record has no
-- field" on every users update from here on. Redefine it against the new
-- column name.
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
  if new.featured_until is distinct from old.featured_until then
    raise exception 'featured_until is managed by admins only';
  end if;
  return new;
end;
$$;
