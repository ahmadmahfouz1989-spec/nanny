-- Nanny becomes an ordinary category: every nanny/parent profile, match,
-- message and rating is copied into the shared generic_* tables that
-- nursing and tutoring already use (see docs/nanny-table-migration-plan.md).
--
-- * Every row keeps its id, so links, notifications, reports, saved
--   profiles, feed attributions and voice-note paths stay valid.
-- * parent -> seeker, nanny -> provider, for roles, statuses and
--   initiated_by alike.
-- * The legacy tables are left in place, untouched, for rollback. A later
--   migration drops them.
-- * Runs in one transaction (the migration runner wraps it); the count
--   checks at the end abort the whole thing if anything didn't copy.

-- The generic tables' guard triggers (protect_moderation_status,
-- protect_generic_profile_photo) only accept these writes from the
-- service role.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

-- ─── 0. Nothing to collide with ────────────────────────────────────────
do $$
begin
  if exists (select 1 from public.generic_profiles g
             where g.id in (select id from public.parent_profiles union all select id from public.nanny_profiles))
     or exists (select 1 from public.generic_matches g where g.id in (select id from public.matches))
     or exists (select 1 from public.generic_messages g where g.id in (select id from public.messages))
     or exists (select 1 from public.generic_ratings g where g.id in (select id from public.ratings)) then
    raise exception 'nanny_to_generic: id collision with existing generic rows -- aborting';
  end if;
end $$;

-- ─── 1. Photos: accept the legacy nanny/parent buckets too ────────────
-- Existing nanny/parent photos stay where they are; new uploads go to
-- generic-photos. Either way the URL must be in the owner's own folder.
create or replace function public.protect_generic_profile_photo()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or new.profile_photo_url is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.profile_photo_url is not distinct from old.profile_photo_url then
    return new;
  end if;
  if position('/storage/v1/object/public/generic-photos/' || new.user_id::text || '/' in new.profile_photo_url) = 0
     and position('/storage/v1/object/public/nanny-photos/' || new.user_id::text || '/' in new.profile_photo_url) = 0
     and position('/storage/v1/object/public/parent-photos/' || new.user_id::text || '/' in new.profile_photo_url) = 0 then
    raise exception 'profile_photo_url must point to your own uploaded photo';
  end if;
  return new;
end;
$$;

-- ─── 2. Profiles ───────────────────────────────────────────────────────
insert into public.generic_profiles (
  id, user_id, category_id, role, full_name, location_id, profile_photo_url,
  attributes, status, moderation_status, created_at, updated_at
)
select
  p.id, p.user_id, c.id, 'seeker', p.full_name, p.location_id, p.profile_photo_url,
  jsonb_strip_nulls(jsonb_build_object(
    'locationDetail', p.location_detail,
    'nationality', p.nationality,
    'numChildren', p.num_children,
    'childrenAgeRanges', to_jsonb(p.children_age_ranges),
    'scheduleType', p.schedule_type,
    'neededDays', to_jsonb(coalesce(p.needed_days, '{}')),
    'liveArrangement', p.live_arrangement,
    'desiredStartDate', to_char(p.desired_start_date, 'YYYY-MM-DD'),
    'transportationRequired', coalesce(p.transportation_required, false),
    'additionalDuties', to_jsonb(coalesce(p.additional_duties, '{}')),
    'familyDescription', p.family_description,
    'languageIds', coalesce(
      (select jsonb_agg(l.language_id) from public.parent_profile_languages l where l.parent_profile_id = p.id),
      '[]'::jsonb)
  )),
  p.status, p.moderation_status, p.created_at, p.updated_at
from public.parent_profiles p
cross join (select id from public.categories where slug = 'nanny') c;

insert into public.generic_profiles (
  id, user_id, category_id, role, full_name, location_id, profile_photo_url,
  attributes, status, moderation_status, created_at, updated_at
)
select
  n.id, n.user_id, c.id, 'provider', n.full_name, n.location_id, n.profile_photo_url,
  jsonb_strip_nulls(jsonb_build_object(
    'locationDetail', n.location_detail,
    'nationality', n.nationality,
    'workRadiusKm', n.work_radius_km,
    'employmentType', n.employment_type,
    'liveArrangementPref', n.live_arrangement_pref,
    -- start_time/end_time -> startTime/endTime, the keys every generic
    -- category uses for hours.
    'availability', jsonb_strip_nulls(jsonb_build_object(
      'days', coalesce(n.availability -> 'days', '[]'::jsonb),
      'startTime', n.availability ->> 'start_time',
      'endTime', n.availability ->> 'end_time'
    )),
    'yearsExperience', n.years_experience,
    'hasTransportation', coalesce(n.has_transportation, false),
    'canDrive', coalesce(n.can_drive, false),
    'certifications', to_jsonb(coalesce(n.certifications, '{}')),
    'shortIntro', n.short_intro,
    'languageIds', coalesce(
      (select jsonb_agg(l.language_id) from public.nanny_profile_languages l where l.nanny_profile_id = n.id),
      '[]'::jsonb),
    'experience', coalesce(
      (select jsonb_agg(jsonb_build_object('ageGroup', e.age_group, 'yearsExperience', e.years_experience)
                        order by e.age_group)
       from public.nanny_experience e where e.nanny_profile_id = n.id),
      '[]'::jsonb)
  )),
  n.status, n.moderation_status, n.created_at, n.updated_at
from public.nanny_profiles n
cross join (select id from public.categories where slug = 'nanny') c;

-- ─── 3. Matches, messages, ratings ─────────────────────────────────────
insert into public.generic_matches (
  id, category_id, seeker_profile_id, provider_profile_id, score, score_breakdown,
  status, initiated_by, interest_expires_at, responded_at, created_at, updated_at
)
select
  m.id, c.id, m.parent_profile_id, m.nanny_profile_id, m.score, m.score_breakdown,
  case m.status
    when 'parent_interested' then 'seeker_interested'
    when 'nanny_interested' then 'provider_interested'
    when 'declined_by_parent' then 'declined_by_seeker'
    when 'declined_by_nanny' then 'declined_by_provider'
    else m.status
  end,
  case m.initiated_by when 'parent' then 'seeker' when 'nanny' then 'provider' end,
  m.interest_expires_at, m.responded_at, m.created_at, m.updated_at
from public.matches m
cross join (select id from public.categories where slug = 'nanny') c;

insert into public.generic_messages (id, match_id, sender_id, body, audio_path, audio_duration_seconds, created_at, read_at)
select id, match_id, sender_id, body, audio_path, audio_duration_seconds, created_at, read_at
from public.messages;

insert into public.generic_ratings (id, match_id, rater_user_id, ratee_user_id, score, comment, created_at, updated_at)
select id, match_id, rater_user_id, ratee_user_id, score, comment, created_at, updated_at
from public.ratings;

-- ─── 4. Rows pointing at nanny profiles/matches ────────────────────────
-- Saved profiles and feed posts allow exactly/at most one target column,
-- so the legacy column is cleared as the generic one is set.
update public.favorites
set generic_profile_id = coalesce(parent_profile_id, nanny_profile_id),
    parent_profile_id = null,
    nanny_profile_id = null
where parent_profile_id is not null or nanny_profile_id is not null;

-- posts_protect_mutation blocks re-pointing a post's identity outright
-- (no service-role exception); this is the same identity under its new
-- id, so the guard is lifted for just this statement.
alter table public.posts disable trigger posts_protect_mutation;
update public.posts
set posted_as_generic_profile_id = coalesce(posted_as_parent_profile_id, posted_as_nanny_profile_id),
    posted_as_parent_profile_id = null,
    posted_as_nanny_profile_id = null
where posted_as_parent_profile_id is not null or posted_as_nanny_profile_id is not null;
alter table public.posts enable trigger posts_protect_mutation;

-- Match notifications carry the same keys every other category uses.
update public.notifications
set payload = (payload - 'match_id')
  || jsonb_build_object('generic_match_id', payload ->> 'match_id', 'category_slug', 'nanny')
where payload ? 'match_id'
  and (payload ->> 'match_id')::uuid in (select id from public.matches);

-- Profile moderation notifications: parent/nanny -> generic + nanny.
update public.notifications
set payload = payload || jsonb_build_object('profile_type', 'generic', 'category_slug', 'nanny')
where payload ->> 'profile_type' in ('parent', 'nanny');

-- reports.match_source is already 'nanny' -- which is now just this
-- category's slug, so existing reports need no change. The validator
-- loses its legacy-table branch.
create or replace function public.report_match_participants_valid(
  p_match_id uuid,
  p_match_source text,
  p_reporter_user_id uuid,
  p_reported_user_id uuid
)
returns boolean
language plpgsql
stable
security definer set search_path = public
as $$
declare
  v_seeker_user_id uuid;
  v_provider_user_id uuid;
begin
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

-- ─── 5. Nanny's entry point is the shared category dashboard ───────────
update public.categories set href = '/categories/nanny/dashboard' where slug = 'nanny';

-- ─── 6. Everything copied, or nothing ──────────────────────────────────
do $$
declare
  v_nanny uuid := (select id from public.categories where slug = 'nanny');
begin
  if (select count(*) from public.generic_profiles where category_id = v_nanny)
     <> (select count(*) from public.parent_profiles) + (select count(*) from public.nanny_profiles) then
    raise exception 'nanny_to_generic: profile count mismatch';
  end if;
  if (select count(*) from public.generic_matches where category_id = v_nanny) <> (select count(*) from public.matches) then
    raise exception 'nanny_to_generic: match count mismatch';
  end if;
  if (select count(*) from public.generic_messages where match_id in (select id from public.matches))
     <> (select count(*) from public.messages) then
    raise exception 'nanny_to_generic: message count mismatch';
  end if;
  if (select count(*) from public.generic_ratings where match_id in (select id from public.matches))
     <> (select count(*) from public.ratings) then
    raise exception 'nanny_to_generic: rating count mismatch';
  end if;
  if exists (select 1 from public.favorites where parent_profile_id is not null or nanny_profile_id is not null)
     or exists (select 1 from public.posts where posted_as_parent_profile_id is not null or posted_as_nanny_profile_id is not null) then
    raise exception 'nanny_to_generic: legacy references left behind';
  end if;
end $$;
