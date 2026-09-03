-- Parents can now say which weekdays they need help. The match engine's
-- availability criterion scores day-overlap against the nanny's stated
-- days; an empty needed_days means "flexible" and falls back to the old
-- flexibility proxy.

alter table public.parent_profiles add column if not exists needed_days text[] not null default '{}';

drop function if exists public.create_parent_profile(
  text, uuid, text, integer, text[], text, text, date, boolean, text[], text, uuid[]
);
drop function if exists public.update_parent_profile(
  text, uuid, text, integer, text[], text, text, date, boolean, text[], text, uuid[]
);

create or replace function public.create_parent_profile(
  p_full_name text,
  p_location_id uuid,
  p_location_detail text,
  p_num_children integer,
  p_children_age_ranges text[],
  p_schedule_type text,
  p_needed_days text[],
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
    schedule_type, needed_days, live_arrangement, desired_start_date,
    transportation_required, additional_duties, family_description, status
  ) values (
    auth.uid(), p_full_name, p_location_id, p_location_detail, p_num_children, p_children_age_ranges,
    p_schedule_type, coalesce(p_needed_days, '{}'), p_live_arrangement, p_desired_start_date,
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
  p_needed_days text[],
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
    needed_days = coalesce(p_needed_days, '{}'),
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

grant execute on function public.create_parent_profile to authenticated;
grant execute on function public.update_parent_profile to authenticated;
