-- Matches can be filtered by district, not just governorate: a new
-- p_district_id (last, defaulting to null). Otherwise the same as
-- 20261022000001_hide_zero_matches.sql. The old 8-argument version is
-- dropped so the two can't be confused.

drop function if exists public.list_profile_matches(uuid, uuid, text, numeric, text[], uuid, int, int);

create or replace function public.list_profile_matches(
  p_profile_id uuid,
  p_governorate_id uuid default null,
  p_day text default null,
  p_min_years numeric default null,
  p_words text[] default null,
  p_match_id uuid default null,
  p_limit int default 20,
  p_offset int default 0,
  p_district_id uuid default null
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
        -- A pair scoring 0 has nothing in common that matters (a
        -- plumber for a painting job, a rider who doesn't do moto taxi):
        -- listing it as a "0% match" only confuses. Any chat between them
        -- stays in Messages.
        v.score > 0
        and (p_governorate_id is null or v.location_id = p_governorate_id)
        -- A district: people there, providers who cover it, and profiles
        -- from before districts in its governorate (they may well be there).
        and (
          p_district_id is null
          or v.attributes ->> 'districtId' = p_district_id::text
          or coalesce(v.attributes -> 'coverDistrictIds', '[]'::jsonb) ? p_district_id::text
          or (
            v.attributes ->> 'districtId' is null
            and v.location_id = (select l.parent_location_id from public.locations l where l.id = p_district_id)
          )
        )
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

grant execute on function public.list_profile_matches(uuid, uuid, text, numeric, text[], uuid, int, int, uuid) to authenticated;
