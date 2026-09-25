-- LOCAL ONLY. Fake nanny/parent data in the legacy tables, covering every
-- shape the nanny → generic migration has to carry over. Fixed ids so
-- nanny-migration-checks.sql can assert on specific rows.
--
--   docker exec -i supabase_db_nanny_app psql -U postgres -d postgres -v ON_ERROR_STOP=1 \
--     < supabase/tests/nanny-migration-fixture.sql
--
-- Password for every account: TestPass123!  (all @example.com)
--
-- Id scheme (last block):  users     0b0N nanny, 0c0N parent, 0d01 admin
--                          profiles  1b0N nanny, 1c0N parent, 1e01 tutoring
--                          matches   2a0N    messages 3a0N    ratings 4a0N

-- Legacy triggers (protect_moderation_status, ...) only allow these writes
-- from the service role.
select set_config('request.jwt.claims', '{"role":"service_role"}', false);
select set_config('request.jwt.claim.role', 'service_role', false);

do $$
declare
  v_pw text := crypt('TestPass123!', gen_salt('bf'));
  v_beirut uuid := (select id from public.locations where level = 'governorate' and name_en = 'Beirut');
  v_mount uuid := (select id from public.locations where level = 'governorate' and name_en = 'Mount Lebanon');
  v_en uuid := (select id from public.languages where code = 'en');
  v_ar uuid := (select id from public.languages where code = 'ar');
  v_fr uuid := (select id from public.languages where code = 'fr');
  v_tutoring uuid := (select id from public.categories where slug = 'tutoring');
  u record;
begin
  for u in select * from (values
    ('00000000-0000-4000-a000-000000000b01'::uuid, 'n1@example.com', 'nanny'),
    ('00000000-0000-4000-a000-000000000b02'::uuid, 'n2@example.com', 'nanny'),
    ('00000000-0000-4000-a000-000000000b03'::uuid, 'n3@example.com', 'nanny'),
    ('00000000-0000-4000-a000-000000000b04'::uuid, 'n4@example.com', 'nanny'),
    ('00000000-0000-4000-a000-000000000c01'::uuid, 'p1@example.com', 'parent'),
    ('00000000-0000-4000-a000-000000000c02'::uuid, 'p2@example.com', 'parent'),
    ('00000000-0000-4000-a000-000000000c03'::uuid, 'p3@example.com', 'parent'),
    ('00000000-0000-4000-a000-000000000d01'::uuid, 'a1@example.com', null)
  ) t(id, email, role) loop
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, v_pw, now(),
      '{"provider":"email","providers":["email"]}',
      case when u.role is null then '{}'::jsonb else jsonb_build_object('role', u.role) end,
      now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email), 'email', now(), now(), now());
  end loop;

  update public.users set role = 'admin' where id = '00000000-0000-4000-a000-000000000d01';
  update public.users set contact_phone = '+96170000001' where id = '00000000-0000-4000-a000-000000000b01';
  update public.users set contact_phone = '+96170000002' where id = '00000000-0000-4000-a000-000000000c01';

  -- ── nanny profiles ──────────────────────────────────────────────────
  -- b01 approved, full detail, photo; b02 approved, 0-year age group;
  -- b03 pending review; b04 draft (never finished)
  insert into public.nanny_profiles (id, user_id, full_name, profile_photo_url, location_id, location_detail, nationality,
    work_radius_km, employment_type, live_arrangement_pref, availability, years_experience,
    has_transportation, can_drive, certifications, short_intro,
    status, moderation_status, created_at)
  values
    ('00000000-0000-4000-a000-000000001b01', '00000000-0000-4000-a000-000000000b01', 'Layla Haddad',
     'http://127.0.0.1:54321/storage/v1/object/public/nanny-photos/00000000-0000-4000-a000-000000000b01/1.jpg',
     v_beirut, 'Achrafieh', 'lebanese', 15, 'full_time', 'live_out',
     '{"days":["mon","tue","wed","thu","fri"],"start_time":"08:00","end_time":"16:00"}', 5.0,
     true, true, '{first_aid_cpr}', 'Warm and experienced.', 'active', 'approved', now() - interval '30 days'),
    ('00000000-0000-4000-a000-000000001b02', '00000000-0000-4000-a000-000000000b02', 'Maya Khalil',
     'http://127.0.0.1:54321/storage/v1/object/public/nanny-photos/00000000-0000-4000-a000-000000000b02/1.jpg',
     v_mount, null, 'syrian', 10, 'part_time', 'either', '{"days":["mon","wed","fri","sat"]}', 3.0,
     false, false, '{}', null, 'active', 'approved', now() - interval '20 days'),
    ('00000000-0000-4000-a000-000000001b03', '00000000-0000-4000-a000-000000000b03', 'Sara Nassar',
     'http://127.0.0.1:54321/storage/v1/object/public/nanny-photos/00000000-0000-4000-a000-000000000b03/1.jpg',
     v_beirut, null, null, 20, 'either', 'live_in', '{"days":["mon","tue","wed","thu","fri","sat","sun"]}', 8.0,
     true, true, '{first_aid_cpr,early_childhood_ed}', 'Live-in, 8 years.', 'active', 'pending', now() - interval '2 days'),
    ('00000000-0000-4000-a000-000000001b04', '00000000-0000-4000-a000-000000000b04', 'Draft Nanny',
     null, v_beirut, null, null, 5, 'either', 'either', '{"days":[]}', 0, false, false, '{}', null,
     'draft', 'pending', now() - interval '1 day');

  insert into public.nanny_profile_languages (nanny_profile_id, language_id) values
    ('00000000-0000-4000-a000-000000001b01', v_en), ('00000000-0000-4000-a000-000000001b01', v_ar),
    ('00000000-0000-4000-a000-000000001b02', v_ar), ('00000000-0000-4000-a000-000000001b02', v_fr),
    ('00000000-0000-4000-a000-000000001b03', v_en);

  insert into public.nanny_experience (nanny_profile_id, age_group, years_experience) values
    ('00000000-0000-4000-a000-000000001b01', 'toddler', 5.0), ('00000000-0000-4000-a000-000000001b01', 'school_age', 3.0),
    ('00000000-0000-4000-a000-000000001b02', 'infant', 3.0), ('00000000-0000-4000-a000-000000001b02', 'toddler', 0),
    ('00000000-0000-4000-a000-000000001b03', 'newborn', 8.0);

  -- ── parent profiles ─────────────────────────────────────────────────
  -- c01 approved w/ photo + needed days; c02 approved, flexible days;
  -- c03 paused
  insert into public.parent_profiles (id, user_id, full_name, profile_photo_url, location_id, location_detail, nationality,
    num_children, children_age_ranges, schedule_type, live_arrangement, desired_start_date,
    transportation_required, additional_duties, family_description, needed_days, status, moderation_status, created_at)
  values
    ('00000000-0000-4000-a000-000000001c01', '00000000-0000-4000-a000-000000000c01', 'Karim Fares',
     'http://127.0.0.1:54321/storage/v1/object/public/parent-photos/00000000-0000-4000-a000-000000000c01/1.jpg',
     v_beirut, 'Gemmayzeh', 'lebanese', 2, '{toddler,school_age}', 'full_time', 'live_out', '2026-10-15',
     false, '{cooking}', 'Family of four.', '{mon,tue,wed}', 'active', 'approved', now() - interval '25 days'),
    ('00000000-0000-4000-a000-000000001c02', '00000000-0000-4000-a000-000000000c02', 'Nour Saad',
     null, v_mount, null, null, 1, '{infant}', 'part_time', 'either', '2026-11-01',
     true, '{}', null, '{}', 'active', 'approved', now() - interval '15 days'),
    ('00000000-0000-4000-a000-000000001c03', '00000000-0000-4000-a000-000000000c03', 'Rami Abou Jaoude',
     null, v_beirut, null, null, 3, '{newborn,toddler,preschool}', 'either', 'live_in', '2026-12-01',
     true, '{}', 'Large family.', '{}', 'paused', 'approved', now() - interval '10 days');

  insert into public.parent_profile_languages (parent_profile_id, language_id) values
    ('00000000-0000-4000-a000-000000001c01', v_en), ('00000000-0000-4000-a000-000000001c01', v_ar),
    ('00000000-0000-4000-a000-000000001c02', v_ar);

  -- A nanny who also seeks a tutor: one account in two categories.
  insert into public.generic_profiles (id, user_id, category_id, role, full_name, location_id, attributes, status, moderation_status)
  values ('00000000-0000-4000-a000-000000001e01', '00000000-0000-4000-a000-000000000b01', v_tutoring, 'seeker',
    'Layla Haddad', v_beirut,
    '{"subjectsNeeded":["math"],"gradeLevel":"primary","format":"either","neededDays":[],"transportationRequired":false,"languageIds":[]}',
    'active', 'approved');

  -- ── matches: one per status ─────────────────────────────────────────
  insert into public.matches (id, parent_profile_id, nanny_profile_id, score, score_breakdown, status, initiated_by,
    interest_expires_at, responded_at, created_at)
  values
    ('00000000-0000-4000-a000-000000002a01', '00000000-0000-4000-a000-000000001c01', '00000000-0000-4000-a000-000000001b01',
     85, '{}', 'mutual', 'parent', now() + interval '10 days', now() - interval '5 days', now() - interval '20 days'),
    ('00000000-0000-4000-a000-000000002a02', '00000000-0000-4000-a000-000000001c01', '00000000-0000-4000-a000-000000001b02',
     40, '{}', 'parent_interested', 'parent', now() + interval '7 days', null, now() - interval '20 days'),
    ('00000000-0000-4000-a000-000000002a03', '00000000-0000-4000-a000-000000001c02', '00000000-0000-4000-a000-000000001b01',
     30, '{}', 'declined_by_nanny', 'parent', null, now() - interval '3 days', now() - interval '15 days'),
    ('00000000-0000-4000-a000-000000002a04', '00000000-0000-4000-a000-000000001c02', '00000000-0000-4000-a000-000000001b02',
     70, '{}', 'nanny_interested', 'nanny', now() - interval '1 day', null, now() - interval '15 days'),
    ('00000000-0000-4000-a000-000000002a05', '00000000-0000-4000-a000-000000001c01', '00000000-0000-4000-a000-000000001b03',
     60, '{}', 'suggested', null, null, null, now() - interval '2 days');

  -- ── messages on the mutual match ────────────────────────────────────
  insert into public.messages (id, match_id, sender_id, body, audio_path, audio_duration_seconds, created_at, read_at) values
    ('00000000-0000-4000-a000-000000003a01', '00000000-0000-4000-a000-000000002a01', '00000000-0000-4000-a000-000000000c01',
     'Hi Layla!', null, null, now() - interval '4 days', now() - interval '4 days'),
    ('00000000-0000-4000-a000-000000003a02', '00000000-0000-4000-a000-000000002a01', '00000000-0000-4000-a000-000000000b01',
     '🎤 Voice note', '00000000-0000-4000-a000-000000000b01/x.webm', 12, now() - interval '3 days', now() - interval '3 days'),
    ('00000000-0000-4000-a000-000000003a03', '00000000-0000-4000-a000-000000002a01', '00000000-0000-4000-a000-000000000c01',
     'When can you start?', null, null, now() - interval '1 hour', null);

  insert into public.ratings (id, match_id, rater_user_id, ratee_user_id, score, comment) values
    ('00000000-0000-4000-a000-000000004a01', '00000000-0000-4000-a000-000000002a01',
     '00000000-0000-4000-a000-000000000c01', '00000000-0000-4000-a000-000000000b01', 5, 'Wonderful'),
    ('00000000-0000-4000-a000-000000004a02', '00000000-0000-4000-a000-000000002a01',
     '00000000-0000-4000-a000-000000000b01', '00000000-0000-4000-a000-000000000c01', 4, null);

  -- ── things pointing at nanny rows ───────────────────────────────────
  insert into public.favorites (user_id, nanny_profile_id) values
    ('00000000-0000-4000-a000-000000000c02', '00000000-0000-4000-a000-000000001b01');
  insert into public.favorites (user_id, parent_profile_id) values
    ('00000000-0000-4000-a000-000000000b02', '00000000-0000-4000-a000-000000001c01');

  insert into public.posts (id, user_id, kind, caption, status, expires_at, posted_as_nanny_profile_id) values
    ('00000000-0000-4000-a000-000000005a01', '00000000-0000-4000-a000-000000000b01', 'offering',
     'Available mornings in Achrafieh', 'open', now() + interval '20 days', '00000000-0000-4000-a000-000000001b01');
  insert into public.posts (id, user_id, kind, caption, status, expires_at, posted_as_parent_profile_id) values
    ('00000000-0000-4000-a000-000000005a02', '00000000-0000-4000-a000-000000000c01', 'looking_for',
     'Need help Tue/Thu', 'open', now() + interval '20 days', '00000000-0000-4000-a000-000000001c01');

  insert into public.notifications (id, user_id, type, payload) values
    ('00000000-0000-4000-a000-000000006a01', '00000000-0000-4000-a000-000000000b01', 'interest_accepted',
     '{"match_id":"00000000-0000-4000-a000-000000002a01"}'),
    ('00000000-0000-4000-a000-000000006a02', '00000000-0000-4000-a000-000000000b01', 'rating_received',
     '{"match_id":"00000000-0000-4000-a000-000000002a01","score":5}'),
    ('00000000-0000-4000-a000-000000006a03', '00000000-0000-4000-a000-000000000b03', 'profile_approved',
     '{"profile_type":"nanny"}');

  insert into public.reports (id, reporter_user_id, reported_user_id, reason, details, status, match_id, match_source) values
    ('00000000-0000-4000-a000-000000007a01', '00000000-0000-4000-a000-000000000c01', '00000000-0000-4000-a000-000000000b01',
     'other', 'Test report', 'open', '00000000-0000-4000-a000-000000002a01', 'nanny');
end $$;
