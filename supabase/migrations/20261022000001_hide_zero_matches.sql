-- Matches no longer lists pairs that scored 0. Same function as
-- 20260927000001_match_list_in_database.sql with one extra condition; a
-- notification's own target (p_match_id) is still returned whatever its
-- score, so a link to it never comes back empty.

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
        -- A pair scoring 0 has nothing in common that matters (a
        -- plumber for a painting job, a rider who doesn't do moto taxi):
        -- listing it as a "0% match" only confuses. Any chat between them
        -- stays in Messages.
        v.score > 0
        and (p_governorate_id is null or v.location_id = p_governorate_id)
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
