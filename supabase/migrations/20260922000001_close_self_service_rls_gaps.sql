-- Pre-launch security review found three self-service RLS gaps: a match's
-- own status (and therefore contact-reveal eligibility) could be set
-- directly by either party, a profile's moderation_status could be
-- self-approved on all three profile tables, and a rewrite of
-- protect_user_role_status() silently dropped its featured_until guard.
-- All three share the same root cause -- an RLS `using`/`with check` clause
-- (or GRANT) that authorizes a row by ownership without restricting which
-- columns the owner may change -- and the same fix shape already proven
-- elsewhere in this schema (protect_matches_mutation, generic_matches'
-- service-role-only write policy).

-- ─── 1. matches: lock to service-role-only writes ──────────────────────
--
-- matches_update let either party flip their own match's `status` straight
-- to 'mutual' with a direct client update -- /api/matches/[id]/contact then
-- trusts that column, so this was a path to revealing the other side's
-- phone/email without their consent. The app's own interest/decline state
-- machine (src/lib/matching/apply-interest.ts and both decline routes)
-- already goes exclusively through the service-role client; there is no
-- legitimate reason for a direct authenticated-role write to this table at
-- all. Bring it to the same posture generic_matches already has.

drop policy if exists matches_update on public.matches;

create policy matches_service_write on public.matches
  for update to service_role using (true) with check (true);

revoke update on public.matches from authenticated;

-- ─── 2. moderation_status: admin-only on all three profile tables ──────
--
-- parent_profiles_update / nanny_profiles_update / generic_profiles_write_own
-- only ever checked row ownership, so a profile owner could set their own
-- moderation_status straight to 'approved' with a direct client write,
-- bypassing admin review entirely. Every legitimate non-admin write already
-- sets it to 'pending' (create_parent_profile/create_nanny_profile,
-- update_parent_profile/update_nanny_profile, and the generic-profile
-- route's upsert) -- only the admin moderation route
-- (/api/admin/profiles/[id]/moderation, via the service-role client) ever
-- needs to set 'approved' or 'rejected'.

create or replace function public.protect_moderation_status()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.moderation_status <> 'pending' then
    raise exception 'moderation_status can only be set to approved/rejected by an admin';
  end if;
  return new;
end;
$$;

create trigger parent_profiles_protect_moderation
  before insert or update on public.parent_profiles
  for each row execute function public.protect_moderation_status();

create trigger nanny_profiles_protect_moderation
  before insert or update on public.nanny_profiles
  for each row execute function public.protect_moderation_status();

create trigger generic_profiles_protect_moderation
  before insert or update on public.generic_profiles
  for each row execute function public.protect_moderation_status();

-- ─── 3. featured_until: restore the guard a later rewrite dropped ──────
--
-- 20260912000001_featured_not_paywall.sql correctly guarded featured_until
-- (renamed from subscribed_until) in protect_user_role_status(). The next
-- rewrite of that same function, 20260916000001_nullable_user_role.sql,
-- fixed a real bug (`<>` reads as NULL, not TRUE, once role can be null --
-- is distinct from is required) but silently dropped the featured_until
-- check while doing so. users_update_own lets any account owner update
-- their own row, so without this trigger back, any user could grant
-- themselves paid Featured placement for free.

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
  if new.featured_until is distinct from old.featured_until then
    raise exception 'featured_until is managed by admins only';
  end if;
  return new;
end;
$$;
