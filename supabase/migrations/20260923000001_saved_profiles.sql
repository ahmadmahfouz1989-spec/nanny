-- Saved profiles (a private bookmark shortlist, separate from sending
-- interest -- saving never notifies anyone or unlocks messaging/contact).
-- `favorites` already exists for this but only supports parent/nanny via
-- an unvalidated `favorited_profile_id uuid not null` + `profile_type`
-- pair with no real foreign key (it can point at nothing). Confirmed live:
-- 0 rows exist in production today, so this is dead weight rather than a
-- real data-migration risk -- but every step below is still written as if
-- rows existed, since that's the safe default for a schema change like
-- this.

-- 1. Add the three real, nullable, mutually-exclusive foreign keys.
alter table public.favorites
  add column parent_profile_id uuid references public.parent_profiles(id) on delete cascade,
  add column nanny_profile_id uuid references public.nanny_profiles(id) on delete cascade,
  add column generic_profile_id uuid references public.generic_profiles(id) on delete cascade;

-- 2. Backfill from the old columns. No generic_profile_id branch: the old
-- schema predates generic_profiles entirely, so profile_type was never
-- anything but 'parent'/'nanny'.
update public.favorites
  set parent_profile_id = favorited_profile_id
  where profile_type = 'parent'
    and exists (select 1 from public.parent_profiles p where p.id = favorited_profile_id);

update public.favorites
  set nanny_profile_id = favorited_profile_id
  where profile_type = 'nanny'
    and exists (select 1 from public.nanny_profiles n where n.id = favorited_profile_id);

-- 3. Fail loudly rather than silently drop data: if any row didn't
-- resolve into exactly one new column (a dangling favorited_profile_id
-- that no longer references a real profile), stop the migration so it can
-- be investigated instead of quietly losing that row's target.
do $$
declare
  v_orphaned_count int;
begin
  select count(*) into v_orphaned_count
  from public.favorites
  where num_nonnulls(parent_profile_id, nanny_profile_id, generic_profile_id) = 0;

  if v_orphaned_count > 0 then
    raise exception 'favorites migration: % row(s) have a favorited_profile_id that no longer resolves to a real profile -- investigate before proceeding', v_orphaned_count;
  end if;
end $$;

-- 4. Exactly one target per row.
alter table public.favorites
  add constraint favorites_exactly_one_target
  check (num_nonnulls(parent_profile_id, nanny_profile_id, generic_profile_id) = 1);

-- 5. One save per user per target. A single composite
-- unique(user_id, parent_profile_id, nanny_profile_id, generic_profile_id)
-- would NOT catch duplicates -- Postgres treats the two always-NULL
-- columns on any two such rows as distinct from each other, so the
-- constraint would never fire. Three partial unique indexes, each scoped
-- to the one column that's actually populated, is the correct shape.
create unique index favorites_user_parent_uidx on public.favorites(user_id, parent_profile_id) where parent_profile_id is not null;
create unique index favorites_user_nanny_uidx on public.favorites(user_id, nanny_profile_id) where nanny_profile_id is not null;
create unique index favorites_user_generic_uidx on public.favorites(user_id, generic_profile_id) where generic_profile_id is not null;

-- 6. Keyset pagination support (ordered by created_at, tie-broken by id).
create index favorites_user_cursor_idx on public.favorites(user_id, created_at, id);

-- 7. Retire the old unvalidated columns (their check/unique constraints
-- reference only these columns, so they're dropped automatically).
alter table public.favorites
  drop column favorited_profile_id,
  drop column profile_type;

-- 8. Per-command RLS, replacing the old blanket "owner all" policy.
-- INSERT needs real checks beyond ownership; SELECT/DELETE don't.
drop policy favorites_owner_all on public.favorites;

create policy favorites_select_own on public.favorites
  for select using (auth.uid() = user_id);

create policy favorites_delete_own on public.favorites
  for delete using (auth.uid() = user_id);

-- "Can't save what you can't view" comes for free here: each nested
-- `select` below is itself filtered by that table's own SELECT policy
-- (parent_profiles_select / nanny_profiles_select / generic_profiles_select,
-- including the mutual-match-counterpart branch added in
-- 20260922000003) -- it does not need to be duplicated. Self-save
-- exclusion does NOT come for free (a profile's own SELECT policy always
-- lets its owner see it) and must be explicit here. Nothing in this
-- schema queries `favorites`, so there's no cycle back into this policy
-- regardless of how deep the parent_profiles/matches chain already goes.
create policy favorites_insert_own on public.favorites
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.users u where u.id = auth.uid() and u.status = 'active')
    and (
      (parent_profile_id is not null and exists (
        select 1 from public.parent_profiles p where p.id = parent_profile_id and p.user_id <> auth.uid()
      ))
      or (nanny_profile_id is not null and exists (
        select 1 from public.nanny_profiles n where n.id = nanny_profile_id and n.user_id <> auth.uid()
      ))
      or (generic_profile_id is not null and exists (
        select 1 from public.generic_profiles g where g.id = generic_profile_id and g.user_id <> auth.uid()
      ))
    )
  );
