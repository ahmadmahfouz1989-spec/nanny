-- Customers' requests no longer wait for an admin. Only provider profiles are
-- reviewed. An admin can still take a request down afterwards.

-- A changed account name sends only provider profiles back for review.
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
      moderation_status = case when status = 'draft' or role = 'seeker' then moderation_status else 'pending' end
  where user_id = new.id
    and full_name is distinct from new.full_name;
  return new;
end;
$$;

-- A customer's own write may leave their request's status as it is. Everyone
-- else's direct write still has to set 'pending', so a provider's edit goes
-- back to review. to_jsonb because the legacy profile tables have no role.
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
    and to_jsonb(old)->>'role' = 'seeker'
    and to_jsonb(new)->>'role' = 'seeker'
    and new.moderation_status = old.moderation_status then
    return new;
  end if;
  if new.moderation_status <> 'pending' then
    raise exception 'moderation_status can only be set to approved/rejected by an admin';
  end if;
  return new;
end;
$$;

-- The guard only accepts this release from the service role.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

-- Release everyone waiting, and keep the promise of telling them. Rejected
-- requests and drafts stay as they are.
with released as (
  update public.generic_profiles
  set moderation_status = 'approved'
  where role = 'seeker' and status <> 'draft' and moderation_status = 'pending'
  returning id, user_id, role, category_id
)
insert into public.notifications (user_id, type, payload)
select r.user_id, 'profile_approved',
  jsonb_build_object('profile_type', 'generic', 'category_slug', c.slug, 'role', r.role, 'profile_id', r.id)
from released r
join public.categories c on c.id = r.category_id;
