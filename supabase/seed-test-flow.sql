-- Test-flow seed data: 3 nanny accounts + 3 parent accounts.
-- Run this in the Supabase SQL Editor (production or local).
-- Password for every seeded account: TestPass123!
--
-- Emails (all @example.com — a reserved domain that never delivers real mail):
--   nanny1.test@example.com   Layla Haddad   (Achrafieh)
--   nanny2.test@example.com   Maya Khalil    (Jounieh)
--   nanny3.test@example.com   Sara Nassar    (Hazmieh)
--   parent1.test@example.com  Karim Fares    (Achrafieh)
--   parent2.test@example.com  Nour Saad      (Jounieh)
--   parent3.test@example.com  Rami Abou Jaoude (Hazmieh)
--
-- Profiles are seeded as status='active', moderation_status='pending' —
-- approve them at /admin/profiles to trigger the real matching engine
-- and generate actual `matches` rows.

do $$
declare
  v_password text := crypt('TestPass123!', gen_salt('bf'));
  v_now timestamptz := now();

  v_nanny1_id uuid := gen_random_uuid();
  v_nanny2_id uuid := gen_random_uuid();
  v_nanny3_id uuid := gen_random_uuid();
  v_parent1_id uuid := gen_random_uuid();
  v_parent2_id uuid := gen_random_uuid();
  v_parent3_id uuid := gen_random_uuid();

  v_nanny1_profile_id uuid;
  v_nanny2_profile_id uuid;
  v_nanny3_profile_id uuid;
  v_parent1_profile_id uuid;
  v_parent2_profile_id uuid;
  v_parent3_profile_id uuid;

  v_achrafieh uuid := (select id from public.locations where name_en = 'Achrafieh' and level = 'area');
  v_jounieh uuid := (select id from public.locations where name_en = 'Jounieh' and level = 'area');
  v_hazmieh uuid := (select id from public.locations where name_en = 'Hazmieh' and level = 'area');

  v_en uuid := (select id from public.languages where code = 'en');
  v_ar uuid := (select id from public.languages where code = 'ar');
  v_fr uuid := (select id from public.languages where code = 'fr');

  v_user record;
begin
  -- ── auth users ──────────────────────────────────────────────────────
  for v_user in
    select * from (values
      (v_nanny1_id, 'nanny1.test@example.com', 'nanny'),
      (v_nanny2_id, 'nanny2.test@example.com', 'nanny'),
      (v_nanny3_id, 'nanny3.test@example.com', 'nanny'),
      (v_parent1_id, 'parent1.test@example.com', 'parent'),
      (v_parent2_id, 'parent2.test@example.com', 'parent'),
      (v_parent3_id, 'parent3.test@example.com', 'parent')
    ) as t(id, email, role)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      v_user.id, 'authenticated', 'authenticated', v_user.email, v_password,
      v_now, '{"provider":"email","providers":["email"]}',
      jsonb_build_object('role', v_user.role),
      v_now, v_now,
      '', '', '', ''
    );

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at
    ) values (
      gen_random_uuid(), v_user.id, v_user.id::text,
      jsonb_build_object('sub', v_user.id::text, 'email', v_user.email),
      'email', v_now, v_now, v_now
    );
  end loop;

  -- ── nanny profiles ──────────────────────────────────────────────────
  insert into public.nanny_profiles (
    user_id, full_name, profile_photo_url, location_id, work_radius_km,
    employment_type, live_arrangement_pref, availability, years_experience,
    expected_salary_min, expected_salary_max, has_transportation, can_drive,
    certifications, short_intro, status, moderation_status
  ) values (
    v_nanny1_id, 'Layla Haddad',
    'https://images.unsplash.com/photo-1666891984308-7ffc3176c72b?auto=format&fit=crop&w=800&q=75',
    v_achrafieh, 15, 'full_time', 'live_out', '{"days":["mon","tue","wed","thu","fri"]}', 5.0,
    700, 900, true, true, '{"first_aid_cpr"}', 'Warm and experienced nanny based in Achrafieh.',
    'active', 'pending'
  ) returning id into v_nanny1_profile_id;

  insert into public.nanny_profiles (
    user_id, full_name, profile_photo_url, location_id, work_radius_km,
    employment_type, live_arrangement_pref, availability, years_experience,
    expected_salary_min, expected_salary_max, has_transportation, can_drive,
    certifications, short_intro, status, moderation_status
  ) values (
    v_nanny2_id, 'Maya Khalil',
    'https://images.unsplash.com/photo-1580451300534-e8617c0334f4?auto=format&fit=crop&w=800&q=75',
    v_jounieh, 10, 'part_time', 'either', '{"days":["mon","wed","fri","sat"]}', 3.0,
    500, 700, false, false, '{}', 'Reliable part-time caregiver in Jounieh, great with babies.',
    'active', 'pending'
  ) returning id into v_nanny2_profile_id;

  insert into public.nanny_profiles (
    user_id, full_name, profile_photo_url, location_id, work_radius_km,
    employment_type, live_arrangement_pref, availability, years_experience,
    expected_salary_min, expected_salary_max, has_transportation, can_drive,
    certifications, short_intro, status, moderation_status
  ) values (
    v_nanny3_id, 'Sara Nassar',
    'https://images.unsplash.com/photo-1685362158423-abf004b858d2?auto=format&fit=crop&w=800&q=75',
    v_hazmieh, 20, 'either', 'live_in', '{"days":["mon","tue","wed","thu","fri","sat","sun"]}', 8.0,
    900, 1200, true, true, '{"first_aid_cpr","early_childhood_ed"}',
    'Live-in nanny with 8 years of experience across all age groups.',
    'active', 'pending'
  ) returning id into v_nanny3_profile_id;

  insert into public.nanny_profile_languages (nanny_profile_id, language_id) values
    (v_nanny1_profile_id, v_en), (v_nanny1_profile_id, v_ar),
    (v_nanny2_profile_id, v_ar), (v_nanny2_profile_id, v_fr),
    (v_nanny3_profile_id, v_en), (v_nanny3_profile_id, v_ar), (v_nanny3_profile_id, v_fr);

  insert into public.nanny_experience (nanny_profile_id, age_group, years_experience) values
    (v_nanny1_profile_id, 'toddler', 5.0), (v_nanny1_profile_id, 'school_age', 3.0),
    (v_nanny2_profile_id, 'infant', 3.0), (v_nanny2_profile_id, 'toddler', 2.0),
    (v_nanny3_profile_id, 'newborn', 8.0), (v_nanny3_profile_id, 'infant', 8.0),
    (v_nanny3_profile_id, 'toddler', 6.0), (v_nanny3_profile_id, 'preschool', 4.0);

  -- ── parent profiles ─────────────────────────────────────────────────
  insert into public.parent_profiles (
    user_id, full_name, location_id, num_children, children_age_ranges,
    schedule_type, live_arrangement, desired_start_date, salary_min, salary_max,
    transportation_required, family_description, status, moderation_status
  ) values (
    v_parent1_id, 'Karim Fares', v_achrafieh, 2, '{"toddler","school_age"}',
    'full_time', 'live_out', current_date + interval '3 weeks', 700, 1000,
    false, 'Family of four in Achrafieh looking for a full-time nanny.',
    'active', 'pending'
  ) returning id into v_parent1_profile_id;

  insert into public.parent_profiles (
    user_id, full_name, location_id, num_children, children_age_ranges,
    schedule_type, live_arrangement, desired_start_date, salary_min, salary_max,
    transportation_required, family_description, status, moderation_status
  ) values (
    v_parent2_id, 'Nour Saad', v_jounieh, 1, '{"infant"}',
    'part_time', 'either', current_date + interval '2 weeks', 500, 800,
    false, 'First-time parents in Jounieh needing part-time help.',
    'active', 'pending'
  ) returning id into v_parent2_profile_id;

  insert into public.parent_profiles (
    user_id, full_name, location_id, num_children, children_age_ranges,
    schedule_type, live_arrangement, desired_start_date, salary_min, salary_max,
    transportation_required, family_description, status, moderation_status
  ) values (
    v_parent3_id, 'Rami Abou Jaoude', v_hazmieh, 3, '{"newborn","toddler","preschool"}',
    'either', 'live_in', current_date + interval '1 month', 900, 1300,
    true, 'Large family in Hazmieh seeking a live-in nanny with transportation.',
    'active', 'pending'
  ) returning id into v_parent3_profile_id;

  insert into public.parent_profile_languages (parent_profile_id, language_id) values
    (v_parent1_profile_id, v_en), (v_parent1_profile_id, v_ar),
    (v_parent2_profile_id, v_ar),
    (v_parent3_profile_id, v_en), (v_parent3_profile_id, v_ar), (v_parent3_profile_id, v_fr);
end $$;
