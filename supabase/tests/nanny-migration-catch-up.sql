-- Catch-up for 20260926000001_nanny_to_generic.sql when that migration ran
-- while the OLD app code was still serving traffic (it was applied
-- on 2026-09-25 before the code deploy). Until the new code is live, the
-- old code keeps writing nanny activity to the legacy tables; this copies
-- whatever changed there since, so nothing is lost at cutover.
--
-- Idempotent -- safe to run more than once. Run with the app in
-- READ_ONLY_MODE, right before deploying the new code:
--   begin; <this file> commit;
--
-- Conflict rule: whichever copy was updated last wins (updated_at), so a
-- change made through the old app's shared-table pages isn't overwritten
-- by an older legacy row.

select set_config('request.jwt.claims', '{"role":"service_role"}', true);
select set_config('request.jwt.claim.role', 'service_role', true);

-- ─── 1. Profiles: new or changed since the migration ───────────────────
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
cross join (select id from public.categories where slug = 'nanny') c
on conflict (id) do update set
  full_name = excluded.full_name, location_id = excluded.location_id,
  profile_photo_url = excluded.profile_photo_url, attributes = excluded.attributes,
  status = excluded.status, moderation_status = excluded.moderation_status, updated_at = excluded.updated_at
where public.generic_profiles.updated_at < excluded.updated_at;

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
cross join (select id from public.categories where slug = 'nanny') c
on conflict (id) do update set
  full_name = excluded.full_name, location_id = excluded.location_id,
  profile_photo_url = excluded.profile_photo_url, attributes = excluded.attributes,
  status = excluded.status, moderation_status = excluded.moderation_status, updated_at = excluded.updated_at
where public.generic_profiles.updated_at < excluded.updated_at;

-- Profiles deleted from the legacy tables since (admin rejection, account
-- deletion) go from the copy too. The old app never creates nanny rows in
-- generic_profiles itself, so a nanny row with no legacy counterpart can
-- only be one of those.
delete from public.generic_profiles g
where g.category_id = (select id from public.categories where slug = 'nanny')
  and not exists (select 1 from public.parent_profiles p where p.id = g.id)
  and not exists (select 1 from public.nanny_profiles n where n.id = g.id);

-- ─── 2. Matches ─────────────────────────────────────────────────────────
-- The old app's shared-table pages may have scored a nanny pair under a
-- new id; the legacy match for that pair wins unless the new one already
-- has conversation or ratings attached.
delete from public.generic_matches g
where g.category_id = (select id from public.categories where slug = 'nanny')
  and not exists (select 1 from public.matches m where m.id = g.id)
  and exists (select 1 from public.matches m where m.parent_profile_id = g.seeker_profile_id and m.nanny_profile_id = g.provider_profile_id)
  and not exists (select 1 from public.generic_messages x where x.match_id = g.id)
  and not exists (select 1 from public.generic_ratings x where x.match_id = g.id);

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
cross join (select id from public.categories where slug = 'nanny') c
where not exists (
  -- a surviving shared-table match for the same pair (it has messages or
  -- ratings, see above) takes precedence over the legacy one
  select 1 from public.generic_matches g
  where g.seeker_profile_id = m.parent_profile_id and g.provider_profile_id = m.nanny_profile_id and g.id <> m.id
)
on conflict (id) do update set
  score = excluded.score, score_breakdown = excluded.score_breakdown, status = excluded.status,
  initiated_by = excluded.initiated_by, interest_expires_at = excluded.interest_expires_at,
  responded_at = excluded.responded_at, updated_at = excluded.updated_at
where public.generic_matches.updated_at < excluded.updated_at;

-- ─── 3. Messages and ratings ────────────────────────────────────────────
insert into public.generic_messages (id, match_id, sender_id, body, audio_path, audio_duration_seconds, created_at, read_at)
select m.id, m.match_id, m.sender_id, m.body, m.audio_path, m.audio_duration_seconds, m.created_at, m.read_at
from public.messages m
where exists (select 1 from public.generic_matches g where g.id = m.match_id)
on conflict (id) do update set read_at = coalesce(public.generic_messages.read_at, excluded.read_at)
where public.generic_messages.read_at is null and excluded.read_at is not null;

insert into public.generic_ratings (id, match_id, rater_user_id, ratee_user_id, score, comment, created_at, updated_at)
select r.id, r.match_id, r.rater_user_id, r.ratee_user_id, r.score, r.comment, r.created_at, r.updated_at
from public.ratings r
where exists (select 1 from public.generic_matches g where g.id = r.match_id)
  and not exists (
    select 1 from public.generic_ratings g
    where g.match_id = r.match_id and g.rater_user_id = r.rater_user_id and g.id <> r.id
  )
on conflict (id) do update set score = excluded.score, comment = excluded.comment, updated_at = excluded.updated_at
where public.generic_ratings.updated_at < excluded.updated_at;

-- ─── 4. Saved profiles, posts, notifications made by the old app ───────
delete from public.favorites f
where (f.parent_profile_id is not null or f.nanny_profile_id is not null)
  and exists (
    select 1 from public.favorites g
    where g.user_id = f.user_id and g.generic_profile_id = coalesce(f.parent_profile_id, f.nanny_profile_id)
  );
update public.favorites
set generic_profile_id = coalesce(parent_profile_id, nanny_profile_id),
    parent_profile_id = null,
    nanny_profile_id = null
where parent_profile_id is not null or nanny_profile_id is not null;

alter table public.posts disable trigger posts_protect_mutation;
update public.posts
set posted_as_generic_profile_id = coalesce(posted_as_parent_profile_id, posted_as_nanny_profile_id),
    posted_as_parent_profile_id = null,
    posted_as_nanny_profile_id = null
where posted_as_parent_profile_id is not null or posted_as_nanny_profile_id is not null;
alter table public.posts enable trigger posts_protect_mutation;

update public.notifications
set payload = (payload - 'match_id')
  || jsonb_build_object('generic_match_id', payload ->> 'match_id', 'category_slug', 'nanny')
where payload ? 'match_id'
  and (payload ->> 'match_id')::uuid in (select id from public.matches);

update public.notifications
set payload = payload || jsonb_build_object('profile_type', 'generic', 'category_slug', 'nanny')
where payload ->> 'profile_type' in ('parent', 'nanny');

-- ─── 5. Everything accounted for ────────────────────────────────────────
do $$
begin
  if exists (select 1 from public.parent_profiles p where not exists (select 1 from public.generic_profiles g where g.id = p.id))
     or exists (select 1 from public.nanny_profiles n where not exists (select 1 from public.generic_profiles g where g.id = n.id)) then
    raise exception 'catch-up: a legacy profile has no copy';
  end if;
  if exists (select 1 from public.messages m where not exists (select 1 from public.generic_messages g where g.id = m.id)
             and exists (select 1 from public.generic_matches g where g.id = m.match_id)) then
    raise exception 'catch-up: a legacy message has no copy';
  end if;
  if exists (select 1 from public.favorites where parent_profile_id is not null or nanny_profile_id is not null)
     or exists (select 1 from public.posts where posted_as_parent_profile_id is not null or posted_as_nanny_profile_id is not null) then
    raise exception 'catch-up: legacy references left behind';
  end if;
end $$;
