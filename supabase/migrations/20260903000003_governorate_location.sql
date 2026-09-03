-- Location model: a profile now picks only a GOVERNORATE (location_id) and
-- types its more specific location as free text (location_detail). Match
-- scoring's location criterion compares governorate only.

alter table public.parent_profiles add column if not exists location_detail text;
alter table public.nanny_profiles add column if not exists location_detail text;

-- Relax the validate trigger FIRST (it required area-level) so the
-- backfill below can move location_id up to a governorate.
create or replace function public.validate_area_location()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from public.locations where id = new.location_id and level = 'governorate'
  ) then
    raise exception 'location_id must reference a location with level = governorate';
  end if;
  return new;
end;
$$;

-- Backfill: move each profile's area-level location_id up to its
-- governorate ancestor, keeping the old area name as the detail text.
with chain as (
  select
    a.id as area_id,
    a.name_en as area_name,
    coalesce(g.id, d.id, a.id) as gov_id
  from public.locations a
  left join public.locations d on d.id = a.parent_location_id
  left join public.locations g on g.id = d.parent_location_id
  where a.level = 'area'
)
update public.parent_profiles p
set location_detail = coalesce(p.location_detail, c.area_name),
    location_id = c.gov_id
from chain c
where p.location_id = c.area_id;

with chain as (
  select
    a.id as area_id,
    a.name_en as area_name,
    coalesce(g.id, d.id, a.id) as gov_id
  from public.locations a
  left join public.locations d on d.id = a.parent_location_id
  left join public.locations g on g.id = d.parent_location_id
  where a.level = 'area'
)
update public.nanny_profiles p
set location_detail = coalesce(p.location_detail, c.area_name),
    location_id = c.gov_id
from chain c
where p.location_id = c.area_id;

-- ─── profile RPCs: add p_location_detail ───────────────────────────────

drop function if exists public.create_parent_profile(
  text, uuid, integer, text[], text, text, date, boolean, text[], text, uuid[]
);
drop function if exists public.update_parent_profile(
  text, uuid, integer, text[], text, text, date, boolean, text[], text, uuid[]
);
drop function if exists public.create_nanny_profile(
  text, text, uuid, integer, text, text, jsonb, numeric, boolean, boolean, text[], text, uuid[], jsonb
);
drop function if exists public.update_nanny_profile(
  text, text, uuid, integer, text, text, jsonb, numeric, boolean, boolean, text[], text, uuid[], jsonb
);

create or replace function public.create_parent_profile(
  p_full_name text,
  p_location_id uuid,
  p_location_detail text,
  p_num_children integer,
  p_children_age_ranges text[],
  p_schedule_type text,
  p_live_arrangement text,
  p_desired_start_date date,
  p_transportation_required boolean,
  p_additional_duties text[],
  p_family_description text,
  p_language_ids uuid[]
)
returns public.parent_profiles
language plpgsql
as $$
declare
  v_profile public.parent_profiles;
  v_lang uuid;
begin
  insert into public.parent_profiles (
    user_id, full_name, location_id, location_detail, num_children, children_age_ranges,
    schedule_type, live_arrangement, desired_start_date,
    transportation_required, additional_duties, family_description, status
  ) values (
    auth.uid(), p_full_name, p_location_id, p_location_detail, p_num_children, p_children_age_ranges,
    p_schedule_type, p_live_arrangement, p_desired_start_date,
    p_transportation_required, coalesce(p_additional_duties, '{}'), p_family_description, 'active'
  ) returning * into v_profile;

  foreach v_lang in array coalesce(p_language_ids, '{}') loop
    insert into public.parent_profile_languages (parent_profile_id, language_id) values (v_profile.id, v_lang);
  end loop;

  return v_profile;
end;
$$;

create or replace function public.update_parent_profile(
  p_full_name text,
  p_location_id uuid,
  p_location_detail text,
  p_num_children integer,
  p_children_age_ranges text[],
  p_schedule_type text,
  p_live_arrangement text,
  p_desired_start_date date,
  p_transportation_required boolean,
  p_additional_duties text[],
  p_family_description text,
  p_language_ids uuid[]
)
returns public.parent_profiles
language plpgsql
as $$
declare
  v_profile public.parent_profiles;
  v_lang uuid;
begin
  update public.parent_profiles set
    full_name = p_full_name,
    location_id = p_location_id,
    location_detail = p_location_detail,
    num_children = p_num_children,
    children_age_ranges = p_children_age_ranges,
    schedule_type = p_schedule_type,
    live_arrangement = p_live_arrangement,
    desired_start_date = p_desired_start_date,
    transportation_required = p_transportation_required,
    additional_duties = coalesce(p_additional_duties, '{}'),
    family_description = p_family_description,
    moderation_status = 'pending'
  where user_id = auth.uid()
  returning * into v_profile;

  if not found then
    raise exception 'profile not found for current user';
  end if;

  delete from public.parent_profile_languages where parent_profile_id = v_profile.id;
  foreach v_lang in array coalesce(p_language_ids, '{}') loop
    insert into public.parent_profile_languages (parent_profile_id, language_id) values (v_profile.id, v_lang);
  end loop;

  return v_profile;
end;
$$;

create or replace function public.create_nanny_profile(
  p_full_name text,
  p_profile_photo_url text,
  p_location_id uuid,
  p_location_detail text,
  p_work_radius_km integer,
  p_employment_type text,
  p_live_arrangement_pref text,
  p_availability jsonb,
  p_years_experience numeric,
  p_has_transportation boolean,
  p_can_drive boolean,
  p_certifications text[],
  p_short_intro text,
  p_language_ids uuid[],
  p_experience jsonb
)
returns public.nanny_profiles
language plpgsql
as $$
declare
  v_profile public.nanny_profiles;
  v_lang uuid;
  v_exp jsonb;
begin
  insert into public.nanny_profiles (
    user_id, full_name, profile_photo_url, location_id, location_detail, work_radius_km,
    employment_type, live_arrangement_pref, availability, years_experience,
    has_transportation, can_drive, certifications, short_intro, status
  ) values (
    auth.uid(), p_full_name, p_profile_photo_url, p_location_id, p_location_detail, p_work_radius_km,
    p_employment_type, p_live_arrangement_pref, p_availability, p_years_experience,
    p_has_transportation, p_can_drive, coalesce(p_certifications, '{}'), p_short_intro, 'active'
  ) returning * into v_profile;

  foreach v_lang in array coalesce(p_language_ids, '{}') loop
    insert into public.nanny_profile_languages (nanny_profile_id, language_id) values (v_profile.id, v_lang);
  end loop;

  for v_exp in select jsonb_array_elements(coalesce(p_experience, '[]'::jsonb)) loop
    insert into public.nanny_experience (nanny_profile_id, age_group, years_experience)
    values (v_profile.id, v_exp->>'age_group', (v_exp->>'years_experience')::numeric);
  end loop;

  return v_profile;
end;
$$;

create or replace function public.update_nanny_profile(
  p_full_name text,
  p_profile_photo_url text,
  p_location_id uuid,
  p_location_detail text,
  p_work_radius_km integer,
  p_employment_type text,
  p_live_arrangement_pref text,
  p_availability jsonb,
  p_years_experience numeric,
  p_has_transportation boolean,
  p_can_drive boolean,
  p_certifications text[],
  p_short_intro text,
  p_language_ids uuid[],
  p_experience jsonb
)
returns public.nanny_profiles
language plpgsql
as $$
declare
  v_profile public.nanny_profiles;
  v_lang uuid;
  v_exp jsonb;
begin
  update public.nanny_profiles set
    full_name = p_full_name,
    profile_photo_url = coalesce(p_profile_photo_url, profile_photo_url),
    location_id = p_location_id,
    location_detail = p_location_detail,
    work_radius_km = p_work_radius_km,
    employment_type = p_employment_type,
    live_arrangement_pref = p_live_arrangement_pref,
    availability = p_availability,
    years_experience = p_years_experience,
    has_transportation = p_has_transportation,
    can_drive = p_can_drive,
    certifications = coalesce(p_certifications, '{}'),
    short_intro = p_short_intro,
    moderation_status = 'pending'
  where user_id = auth.uid()
  returning * into v_profile;

  if not found then
    raise exception 'profile not found for current user';
  end if;

  delete from public.nanny_profile_languages where nanny_profile_id = v_profile.id;
  foreach v_lang in array coalesce(p_language_ids, '{}') loop
    insert into public.nanny_profile_languages (nanny_profile_id, language_id) values (v_profile.id, v_lang);
  end loop;

  delete from public.nanny_experience where nanny_profile_id = v_profile.id;
  for v_exp in select jsonb_array_elements(coalesce(p_experience, '[]'::jsonb)) loop
    insert into public.nanny_experience (nanny_profile_id, age_group, years_experience)
    values (v_profile.id, v_exp->>'age_group', (v_exp->>'years_experience')::numeric);
  end loop;

  return v_profile;
end;
$$;

grant execute on function public.create_parent_profile to authenticated;
grant execute on function public.update_parent_profile to authenticated;
grant execute on function public.create_nanny_profile to authenticated;
grant execute on function public.update_nanny_profile to authenticated;
