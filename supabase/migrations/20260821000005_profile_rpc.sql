-- Atomic create/update RPCs for profiles + their join-table rows (spec §5.2,
-- §7.2). A profile write always touches parent_profiles/nanny_profiles plus
-- N language rows (and, for nannies, N experience rows) — these functions
-- keep that as one transaction instead of sequential client-side inserts
-- that could partially fail. security invoker (the default) so RLS on the
-- underlying tables still applies to the calling user.

create or replace function public.create_parent_profile(
  p_full_name text,
  p_location_id uuid,
  p_num_children integer,
  p_children_age_ranges text[],
  p_schedule_type text,
  p_live_arrangement text,
  p_desired_start_date date,
  p_salary_min integer,
  p_salary_max integer,
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
    user_id, full_name, location_id, num_children, children_age_ranges,
    schedule_type, live_arrangement, desired_start_date, salary_min, salary_max,
    transportation_required, additional_duties, family_description, status
  ) values (
    auth.uid(), p_full_name, p_location_id, p_num_children, p_children_age_ranges,
    p_schedule_type, p_live_arrangement, p_desired_start_date, p_salary_min, p_salary_max,
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
  p_num_children integer,
  p_children_age_ranges text[],
  p_schedule_type text,
  p_live_arrangement text,
  p_desired_start_date date,
  p_salary_min integer,
  p_salary_max integer,
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
    num_children = p_num_children,
    children_age_ranges = p_children_age_ranges,
    schedule_type = p_schedule_type,
    live_arrangement = p_live_arrangement,
    desired_start_date = p_desired_start_date,
    salary_min = p_salary_min,
    salary_max = p_salary_max,
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
  p_work_radius_km integer,
  p_employment_type text,
  p_live_arrangement_pref text,
  p_availability jsonb,
  p_years_experience numeric,
  p_expected_salary_min integer,
  p_expected_salary_max integer,
  p_has_transportation boolean,
  p_can_drive boolean,
  p_certifications text[],
  p_short_intro text,
  p_language_ids uuid[],
  p_experience jsonb -- [{ "age_group": "toddler", "years_experience": 3 }, ...]
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
    user_id, full_name, profile_photo_url, location_id, work_radius_km,
    employment_type, live_arrangement_pref, availability, years_experience,
    expected_salary_min, expected_salary_max, has_transportation, can_drive,
    certifications, short_intro, status
  ) values (
    auth.uid(), p_full_name, p_profile_photo_url, p_location_id, p_work_radius_km,
    p_employment_type, p_live_arrangement_pref, p_availability, p_years_experience,
    p_expected_salary_min, p_expected_salary_max, p_has_transportation, p_can_drive,
    coalesce(p_certifications, '{}'), p_short_intro, 'active'
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
  p_work_radius_km integer,
  p_employment_type text,
  p_live_arrangement_pref text,
  p_availability jsonb,
  p_years_experience numeric,
  p_expected_salary_min integer,
  p_expected_salary_max integer,
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
    work_radius_km = p_work_radius_km,
    employment_type = p_employment_type,
    live_arrangement_pref = p_live_arrangement_pref,
    availability = p_availability,
    years_experience = p_years_experience,
    expected_salary_min = p_expected_salary_min,
    expected_salary_max = p_expected_salary_max,
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

-- ─── nanny profile photos ───────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nanny-photos', 'nanny-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy nanny_photos_owner_write on storage.objects
  for insert with check (
    bucket_id = 'nanny-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy nanny_photos_owner_update on storage.objects
  for update using (
    bucket_id = 'nanny-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy nanny_photos_owner_delete on storage.objects
  for delete using (
    bucket_id = 'nanny-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy nanny_photos_public_read on storage.objects
  for select using (bucket_id = 'nanny-photos');
