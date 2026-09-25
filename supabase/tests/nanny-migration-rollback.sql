-- ROLLBACK for 20260926000001_nanny_to_generic.sql. Only valid while the
-- legacy nanny tables still exist and before any new nanny activity has
-- been written to the shared tables (i.e. during the cutover window,
-- before read-only mode is lifted) -- anything written to generic_* for
-- nanny after that would be discarded.
--
-- Run as one transaction:  begin; <this file> commit;
-- Tested locally against supabase/tests/nanny-migration-fixture.sql.

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

-- 1. Point saved profiles and feed posts back at the legacy rows (the ids
--    are the same; which legacy table holds the id says which column).
update public.favorites f
set parent_profile_id = case when exists (select 1 from public.parent_profiles p where p.id = f.generic_profile_id) then f.generic_profile_id end,
    nanny_profile_id = case when exists (select 1 from public.nanny_profiles n where n.id = f.generic_profile_id) then f.generic_profile_id end,
    generic_profile_id = null
where f.generic_profile_id in (select id from public.parent_profiles union all select id from public.nanny_profiles);

alter table public.posts disable trigger posts_protect_mutation;
update public.posts p
set posted_as_parent_profile_id = case when exists (select 1 from public.parent_profiles x where x.id = p.posted_as_generic_profile_id) then p.posted_as_generic_profile_id end,
    posted_as_nanny_profile_id = case when exists (select 1 from public.nanny_profiles x where x.id = p.posted_as_generic_profile_id) then p.posted_as_generic_profile_id end,
    posted_as_generic_profile_id = null
where p.posted_as_generic_profile_id in (select id from public.parent_profiles union all select id from public.nanny_profiles);
alter table public.posts enable trigger posts_protect_mutation;

-- 2. Notifications back to the legacy payload keys.
update public.notifications
set payload = (payload - 'generic_match_id' - 'category_slug') || jsonb_build_object('match_id', payload ->> 'generic_match_id')
where payload ? 'generic_match_id'
  and (payload ->> 'generic_match_id')::uuid in (select id from public.matches);

-- Moderation notifications: the original parent/nanny profile_type isn't
-- recoverable from the payload, so derive it from which table the
-- recipient's profile is in.
update public.notifications n
set payload = (payload - 'category_slug') || jsonb_build_object(
  'profile_type',
  case when exists (select 1 from public.parent_profiles p where p.user_id = n.user_id) then 'parent' else 'nanny' end
)
where payload ->> 'profile_type' = 'generic'
  and payload ->> 'category_slug' = 'nanny';

-- 3. Remove the copies. Deleting the profiles cascades to their
--    generic_matches, and from there to generic_messages and
--    generic_ratings.
delete from public.generic_profiles where category_id = (select id from public.categories where slug = 'nanny');

-- 4. Functions and category link as they were.
drop function public.list_saved_favorites(uuid, text, text, timestamptz, uuid, int);
create function public.list_saved_favorites(
  p_user_id uuid,
  p_category text,
  p_role text,
  p_cursor_created_at timestamptz,
  p_cursor_id uuid,
  p_limit int
)
returns table (
  id uuid,
  created_at timestamptz,
  parent_profile_id uuid,
  nanny_profile_id uuid,
  generic_profile_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  select f.id, f.created_at, f.parent_profile_id, f.nanny_profile_id, f.generic_profile_id
  from public.favorites f
  left join public.generic_profiles gp on gp.id = f.generic_profile_id
  left join public.categories c on c.id = gp.category_id
  where f.user_id = p_user_id
    and (
      (p_category is null and p_role is null)
      or (
        p_category = 'nanny'
        and (
          (p_role is null and (f.parent_profile_id is not null or f.nanny_profile_id is not null))
          or (p_role = 'seeking' and f.parent_profile_id is not null)
          or (p_role = 'offering' and f.nanny_profile_id is not null)
        )
      )
      or (
        p_category in ('nursing', 'tutoring')
        and gp.id is not null
        and c.slug = p_category
        and (
          p_role is null
          or (p_role = 'seeking' and gp.role = 'seeker')
          or (p_role = 'offering' and gp.role = 'provider')
        )
      )
      or (
        p_category is null
        and p_role is not null
        and (
          (p_role = 'seeking' and (f.parent_profile_id is not null or (gp.id is not null and gp.role = 'seeker')))
          or (p_role = 'offering' and (f.nanny_profile_id is not null or (gp.id is not null and gp.role = 'provider')))
        )
      )
    )
    and (
      p_cursor_created_at is null
      or f.created_at < p_cursor_created_at
      or (f.created_at = p_cursor_created_at and f.id < p_cursor_id)
    )
  order by f.created_at desc, f.id desc
  limit p_limit;
$$;

grant execute on function public.list_saved_favorites to authenticated;

create or replace function public.report_match_participants_valid(
  p_match_id uuid,
  p_match_source text,
  p_reporter_user_id uuid,
  p_reported_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_parent_user_id uuid;
  v_nanny_user_id uuid;
  v_seeker_user_id uuid;
  v_provider_user_id uuid;
begin
  if p_match_source = 'nanny' then
    select pp.user_id, np.user_id into v_parent_user_id, v_nanny_user_id
    from public.matches m
    join public.parent_profiles pp on pp.id = m.parent_profile_id
    join public.nanny_profiles np on np.id = m.nanny_profile_id
    where m.id = p_match_id;

    return v_parent_user_id is not null
      and ((v_parent_user_id = p_reporter_user_id and v_nanny_user_id = p_reported_user_id)
        or (v_nanny_user_id = p_reporter_user_id and v_parent_user_id = p_reported_user_id));
  end if;

  select seeker.user_id, provider.user_id into v_seeker_user_id, v_provider_user_id
  from public.generic_matches gm
  join public.generic_profiles seeker on seeker.id = gm.seeker_profile_id
  join public.generic_profiles provider on provider.id = gm.provider_profile_id
  where gm.id = p_match_id;

  return v_seeker_user_id is not null
    and ((v_seeker_user_id = p_reporter_user_id and v_provider_user_id = p_reported_user_id)
      or (v_provider_user_id = p_reporter_user_id and v_seeker_user_id = p_reported_user_id));
end;
$$;

update public.categories set href = '/dashboard' where slug = 'nanny';

do $$
begin
  if exists (select 1 from public.generic_profiles where category_id = (select id from public.categories where slug = 'nanny')) then
    raise exception 'rollback: nanny rows still present in generic_profiles';
  end if;
  if exists (select 1 from public.favorites where num_nonnulls(parent_profile_id, nanny_profile_id, generic_profile_id) <> 1) then
    raise exception 'rollback: a saved profile lost its target';
  end if;
end $$;
