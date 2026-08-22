-- Row-level security policies (spec: docs/product-spec.md §3, §7.1)
-- Admin access is granted exclusively through server-side routes using the
-- Supabase service-role key (spec §5.7), which bypasses RLS entirely — so no
-- policy below special-cases the business-level 'admin' role.

-- ─── auth.users → public.users provisioning ────────────────────────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  requested_role text := coalesce(new.raw_user_meta_data->>'role', 'parent');
begin
  -- signup metadata is client-controlled; never allow self-provisioned admin accounts
  if requested_role not in ('parent', 'nanny') then
    requested_role := 'parent';
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─── users ──────────────────────────────────────────────────────────────

alter table public.users enable row level security;

create policy users_select_own on public.users
  for select using (auth.uid() = id);

create policy users_update_own on public.users
  for update using (auth.uid() = id) with check (auth.uid() = id);

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
  return new;
end;
$$;

create trigger users_protect_role_status
  before update on public.users
  for each row execute function public.protect_user_role_status();

-- ─── locations, languages: public read, service-role write ────────────

alter table public.locations enable row level security;
alter table public.languages enable row level security;

create policy locations_select_all on public.locations for select using (true);
create policy languages_select_all on public.languages for select using (true);

-- ─── parent_profiles ────────────────────────────────────────────────────

alter table public.parent_profiles enable row level security;

create policy parent_profiles_select on public.parent_profiles
  for select using (
    auth.uid() = user_id
    or (
      status = 'active' and moderation_status = 'approved'
      and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'nanny')
    )
  );

create policy parent_profiles_insert on public.parent_profiles
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'parent')
  );

create policy parent_profiles_update on public.parent_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.parent_profile_languages enable row level security;

create policy parent_profile_languages_select on public.parent_profile_languages
  for select using (
    exists (
      select 1 from public.parent_profiles pp
      where pp.id = parent_profile_id
        and (
          pp.user_id = auth.uid()
          or (
            pp.status = 'active' and pp.moderation_status = 'approved'
            and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'nanny')
          )
        )
    )
  );

create policy parent_profile_languages_write on public.parent_profile_languages
  for all using (
    exists (select 1 from public.parent_profiles pp where pp.id = parent_profile_id and pp.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.parent_profiles pp where pp.id = parent_profile_id and pp.user_id = auth.uid())
  );

-- ─── nanny_profiles ─────────────────────────────────────────────────────

alter table public.nanny_profiles enable row level security;

create policy nanny_profiles_select on public.nanny_profiles
  for select using (
    auth.uid() = user_id
    or (
      status = 'active' and moderation_status = 'approved'
      and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'parent')
    )
  );

create policy nanny_profiles_insert on public.nanny_profiles
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'nanny')
  );

create policy nanny_profiles_update on public.nanny_profiles
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

alter table public.nanny_profile_languages enable row level security;

create policy nanny_profile_languages_select on public.nanny_profile_languages
  for select using (
    exists (
      select 1 from public.nanny_profiles np
      where np.id = nanny_profile_id
        and (
          np.user_id = auth.uid()
          or (
            np.status = 'active' and np.moderation_status = 'approved'
            and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'parent')
          )
        )
    )
  );

create policy nanny_profile_languages_write on public.nanny_profile_languages
  for all using (
    exists (select 1 from public.nanny_profiles np where np.id = nanny_profile_id and np.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.nanny_profiles np where np.id = nanny_profile_id and np.user_id = auth.uid())
  );

alter table public.nanny_experience enable row level security;

create policy nanny_experience_select on public.nanny_experience
  for select using (
    exists (
      select 1 from public.nanny_profiles np
      where np.id = nanny_profile_id
        and (
          np.user_id = auth.uid()
          or (
            np.status = 'active' and np.moderation_status = 'approved'
            and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'parent')
          )
        )
    )
  );

create policy nanny_experience_write on public.nanny_experience
  for all using (
    exists (select 1 from public.nanny_profiles np where np.id = nanny_profile_id and np.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.nanny_profiles np where np.id = nanny_profile_id and np.user_id = auth.uid())
  );

-- ─── matches ────────────────────────────────────────────────────────────

alter table public.matches enable row level security;

create policy matches_select on public.matches
  for select using (
    exists (select 1 from public.parent_profiles pp where pp.id = parent_profile_id and pp.user_id = auth.uid())
    or exists (select 1 from public.nanny_profiles np where np.id = nanny_profile_id and np.user_id = auth.uid())
  );

-- inserts/score writes are performed by the matching engine via the service-role
-- key only (spec §4.3) — intentionally no insert policy for authenticated users.

create policy matches_update on public.matches
  for update using (
    exists (select 1 from public.parent_profiles pp where pp.id = parent_profile_id and pp.user_id = auth.uid())
    or exists (select 1 from public.nanny_profiles np where np.id = nanny_profile_id and np.user_id = auth.uid())
  );

create or replace function public.protect_matches_mutation()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  if new.score <> old.score
     or new.score_breakdown <> old.score_breakdown
     or new.parent_profile_id <> old.parent_profile_id
     or new.nanny_profile_id <> old.nanny_profile_id then
    raise exception 'score and profile references are managed by the matching engine only';
  end if;
  return new;
end;
$$;

create trigger matches_protect_mutation
  before update on public.matches
  for each row execute function public.protect_matches_mutation();

-- ─── references (nanny-supplied), verification ─────────────────────────

alter table public."references" enable row level security;

create policy references_owner_all on public."references"
  for all using (
    exists (select 1 from public.nanny_profiles np where np.id = nanny_profile_id and np.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.nanny_profiles np where np.id = nanny_profile_id and np.user_id = auth.uid())
  );

alter table public.verification enable row level security;

create policy verification_select_own on public.verification
  for select using (auth.uid() = user_id);

create policy verification_insert_own on public.verification
  for insert with check (auth.uid() = user_id and status = 'pending');

-- no update policy for authenticated users: status/verified_* are set only
-- via service-role admin/verification routes (spec §3.9, §7.1).

-- ─── reports ────────────────────────────────────────────────────────────

alter table public.reports enable row level security;

create policy reports_insert_own on public.reports
  for insert with check (auth.uid() = reporter_user_id);

create policy reports_select_own on public.reports
  for select using (auth.uid() = reporter_user_id);

-- ─── blocks ─────────────────────────────────────────────────────────────

alter table public.blocks enable row level security;

create policy blocks_owner_all on public.blocks
  for all using (auth.uid() = blocker_user_id) with check (auth.uid() = blocker_user_id);

-- ─── favorites ──────────────────────────────────────────────────────────

alter table public.favorites enable row level security;

create policy favorites_owner_all on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ─── notifications ──────────────────────────────────────────────────────

alter table public.notifications enable row level security;

create policy notifications_select_own on public.notifications
  for select using (auth.uid() = user_id);

create policy notifications_update_own on public.notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- inserts are written by server-side routes only (service role) per spec §3.12.
