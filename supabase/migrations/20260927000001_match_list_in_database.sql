-- Match lists are filtered, searched, ordered and paged in the database
-- instead of in the app, so a request reads one page of matches rather
-- than every match in the category.
--
-- Additive only (a column and two functions): the app code that
-- predates this keeps working unchanged, so this can be applied before
-- the code that uses it is deployed.

-- ─── 1. What a search can match, stored per profile ────────────────────
-- Written by the app (src/lib/profile-search.ts) whenever a profile is
-- saved: name, area, languages, intro/description and every tag's English
-- and Arabic label, already lowercased and accent/diacritic-free. The app
-- fills in any row still missing it the first time a list needs it.
-- No index: a search only ever scans one profile's own matches.
alter table public.generic_profiles add column search_text text;

-- ─── 2. Featured, without exposing users ───────────────────────────────
-- users is readable only by its owner; this answers "is this person
-- Featured" (already shown on every match card) and nothing else.
create or replace function public.user_is_featured(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select featured_until > now() from public.users where id = p_user_id), false);
$$;

grant execute on function public.user_is_featured(uuid) to authenticated;

-- ─── 3. One page of a profile's match list ─────────────────────────────
-- Runs as the caller (security invoker), so the usual policies decide
-- everything: only the caller's own matches, and only counterparts they
-- are allowed to see. Order: Featured first, then best match.
--   p_day: counterparts with that weekday, or with no days listed
--     (a flexible seeker fits any day)
--   p_words: normalized search words; every one must appear
--   p_match_id: a notification's target -- returned on its own,
--     ignoring every other filter
create or replace function public.list_profile_matches(
  p_profile_id uuid,
  p_governorate_id uuid default null,
  p_day text default null,
  p_min_years numeric default null,
  p_words text[] default null,
  p_match_id uuid default null,
  p_limit int default 20,
  p_offset int default 0
)
returns table (match_id uuid, other_profile_id uuid, featured boolean, total bigint)
language sql
stable
security invoker
set search_path = public
as $$
  with mine as (
    select gm.id, gm.score,
           case when gm.seeker_profile_id = p_profile_id then gm.provider_profile_id else gm.seeker_profile_id end as other_id
    from public.generic_matches gm
    where gm.seeker_profile_id = p_profile_id or gm.provider_profile_id = p_profile_id
  ),
  visible as (
    select m.id, m.score, o.id as other_id, public.user_is_featured(o.user_id) as featured,
           o.location_id, o.attributes, o.search_text
    from mine m
    join public.generic_profiles o on o.id = m.other_id
  ),
  filtered as (
    select * from visible v
    where
      case when p_match_id is not null then v.id = p_match_id
      else
        (p_governorate_id is null or v.location_id = p_governorate_id)
        and (
          p_day is null
          or jsonb_array_length(coalesce(v.attributes -> 'availability' -> 'days', v.attributes -> 'neededDays', '[]'::jsonb)) = 0
          or coalesce(v.attributes -> 'availability' -> 'days', v.attributes -> 'neededDays') ? p_day
        )
        and (
          p_min_years is null
          or (jsonb_typeof(v.attributes -> 'yearsExperience') = 'number' and (v.attributes ->> 'yearsExperience')::numeric >= p_min_years)
        )
        and (
          p_words is null
          or not exists (select 1 from unnest(p_words) w where position(w in coalesce(v.search_text, '')) = 0)
        )
      end
  )
  select f.id, f.other_id, f.featured, count(*) over ()
  from filtered f
  order by f.featured desc, f.score desc, f.id
  limit p_limit offset p_offset;
$$;

grant execute on function public.list_profile_matches(uuid, uuid, text, numeric, text[], uuid, int, int) to authenticated;
