-- LOCAL ONLY. Assertions after running 20260926000001_nanny_to_generic.sql
-- on top of nanny-migration-fixture.sql. Any failure raises; silence means
-- every check passed.

do $$
declare
  v_nanny uuid := (select id from public.categories where slug = 'nanny');
  r record;
  a jsonb;
begin
  -- Nanny b01: every field carried, hours renamed, 0-year age group kept.
  select * into r from public.generic_profiles where id = '00000000-0000-4000-a000-000000001b01';
  a := r.attributes;
  assert r.category_id = v_nanny and r.role = 'provider', 'b01 category/role';
  assert r.user_id = '00000000-0000-4000-a000-000000000b01', 'b01 user';
  assert r.status = 'active' and r.moderation_status = 'approved', 'b01 status/moderation kept';
  assert r.profile_photo_url like '%/nanny-photos/00000000-0000-4000-a000-000000000b01/%', 'b01 photo kept';
  assert a ->> 'locationDetail' = 'Achrafieh' and a ->> 'nationality' = 'lebanese', 'b01 location/nationality';
  assert (a ->> 'workRadiusKm')::int = 15 and a ->> 'employmentType' = 'full_time'
     and a ->> 'liveArrangementPref' = 'live_out', 'b01 work prefs';
  assert a -> 'availability' = '{"days":["mon","tue","wed","thu","fri"],"startTime":"08:00","endTime":"16:00"}'::jsonb,
    'b01 availability: ' || (a -> 'availability')::text;
  assert (a ->> 'yearsExperience')::numeric = 5 and (a ->> 'hasTransportation')::boolean and (a ->> 'canDrive')::boolean,
    'b01 experience/transport';
  assert a -> 'certifications' = '["first_aid_cpr"]'::jsonb, 'b01 certifications';
  assert a ->> 'shortIntro' = 'Warm and experienced.', 'b01 intro';
  assert jsonb_array_length(a -> 'languageIds') = 2, 'b01 languages';
  assert a -> 'experience' = '[{"ageGroup":"school_age","yearsExperience":3.0},{"ageGroup":"toddler","yearsExperience":5.0}]'::jsonb,
    'b01 experience: ' || (a -> 'experience')::text;

  -- Nanny b02: no hours, no intro -> keys absent rather than null; the
  -- 0-year toddler entry is kept (scoring ignores it, the card shows it).
  a := (select attributes from public.generic_profiles where id = '00000000-0000-4000-a000-000000001b02');
  assert a -> 'availability' = '{"days":["mon","wed","fri","sat"]}'::jsonb, 'b02 availability';
  assert not a ? 'shortIntro' and not a ? 'locationDetail', 'b02 nulls stripped';
  assert a -> 'experience' @> '[{"ageGroup":"toddler","yearsExperience":0}]'::jsonb, 'b02 zero-year entry kept';

  -- Pending and draft states survive.
  assert (select moderation_status from public.generic_profiles where id = '00000000-0000-4000-a000-000000001b03') = 'pending', 'b03 pending';
  assert (select status from public.generic_profiles where id = '00000000-0000-4000-a000-000000001b04') = 'draft', 'b04 draft';

  -- Parent c01.
  select * into r from public.generic_profiles where id = '00000000-0000-4000-a000-000000001c01';
  a := r.attributes;
  assert r.category_id = v_nanny and r.role = 'seeker', 'c01 category/role';
  assert r.profile_photo_url like '%/parent-photos/%', 'c01 photo';
  assert (a ->> 'numChildren')::int = 2 and a -> 'childrenAgeRanges' = '["toddler","school_age"]'::jsonb, 'c01 children';
  assert a ->> 'scheduleType' = 'full_time' and a ->> 'liveArrangement' = 'live_out', 'c01 schedule';
  assert a ->> 'desiredStartDate' = '2026-10-15', 'c01 start date';
  assert a -> 'neededDays' = '["mon","tue","wed"]'::jsonb, 'c01 needed days';
  assert a -> 'additionalDuties' = '["cooking"]'::jsonb and a ->> 'familyDescription' = 'Family of four.', 'c01 duties/description';
  assert (a ->> 'transportationRequired')::boolean = false, 'c01 transport';
  assert (select status from public.generic_profiles where id = '00000000-0000-4000-a000-000000001c03') = 'paused', 'c03 paused';

  -- The account's tutoring profile is untouched and separate.
  assert (select count(*) from public.generic_profiles where user_id = '00000000-0000-4000-a000-000000000b01') = 2,
    'b01 account holds nanny + tutoring';

  -- Matches: statuses and initiated_by mapped, everything else kept.
  assert (select status from public.generic_matches where id = '00000000-0000-4000-a000-000000002a01') = 'mutual', 'a01 mutual';
  assert (select status || '/' || initiated_by from public.generic_matches where id = '00000000-0000-4000-a000-000000002a02')
    = 'seeker_interested/seeker', 'a02 mapped';
  assert (select status from public.generic_matches where id = '00000000-0000-4000-a000-000000002a03') = 'declined_by_provider', 'a03 mapped';
  assert (select status || '/' || initiated_by from public.generic_matches where id = '00000000-0000-4000-a000-000000002a04')
    = 'provider_interested/provider', 'a04 mapped';
  assert (select interest_expires_at < now() from public.generic_matches where id = '00000000-0000-4000-a000-000000002a04'),
    'a04 still reads as expired';
  assert (select initiated_by is null from public.generic_matches where id = '00000000-0000-4000-a000-000000002a05'), 'a05 suggested';
  assert (select seeker_profile_id = '00000000-0000-4000-a000-000000001c01' and provider_profile_id = '00000000-0000-4000-a000-000000001b01'
          from public.generic_matches where id = '00000000-0000-4000-a000-000000002a01'), 'a01 sides';

  -- Messages: voice note path and read state kept.
  assert (select audio_path = '00000000-0000-4000-a000-000000000b01/x.webm' and audio_duration_seconds = 12
          from public.generic_messages where id = '00000000-0000-4000-a000-000000003a02'), 'voice note';
  assert (select read_at is null from public.generic_messages where id = '00000000-0000-4000-a000-000000003a03'), 'unread kept';

  assert (select count(*) from public.generic_ratings where match_id = '00000000-0000-4000-a000-000000002a01') = 2, 'ratings';

  -- References re-pointed.
  assert (select generic_profile_id from public.favorites where user_id = '00000000-0000-4000-a000-000000000c02')
    = '00000000-0000-4000-a000-000000001b01', 'favorite -> nanny';
  assert (select generic_profile_id from public.favorites where user_id = '00000000-0000-4000-a000-000000000b02')
    = '00000000-0000-4000-a000-000000001c01', 'favorite -> parent';
  assert (select posted_as_generic_profile_id from public.posts where id = '00000000-0000-4000-a000-000000005a01')
    = '00000000-0000-4000-a000-000000001b01', 'post as nanny';
  assert (select posted_as_generic_profile_id from public.posts where id = '00000000-0000-4000-a000-000000005a02')
    = '00000000-0000-4000-a000-000000001c01', 'post as parent';
  assert (select payload = '{"generic_match_id":"00000000-0000-4000-a000-000000002a01","category_slug":"nanny"}'::jsonb
          from public.notifications where id = '00000000-0000-4000-a000-000000006a01'), 'match notification';
  assert (select (payload ->> 'score')::int = 5 and payload ? 'generic_match_id' and not payload ? 'match_id'
          from public.notifications where id = '00000000-0000-4000-a000-000000006a02'), 'rating notification';
  assert (select payload ->> 'profile_type' = 'generic' and payload ->> 'category_slug' = 'nanny'
          from public.notifications where id = '00000000-0000-4000-a000-000000006a03'), 'moderation notification';

  -- Reports on nanny matches still validate against the new tables.
  assert public.report_match_participants_valid('00000000-0000-4000-a000-000000002a01', 'nanny',
    '00000000-0000-4000-a000-000000000c01', '00000000-0000-4000-a000-000000000b01'), 'report validator';
  assert not public.report_match_participants_valid('00000000-0000-4000-a000-000000002a01', 'nanny',
    '00000000-0000-4000-a000-000000000c02', '00000000-0000-4000-a000-000000000b01'), 'report validator rejects outsider';

  assert (select href from public.categories where slug = 'nanny') = '/categories/nanny/dashboard', 'category href';

  -- Legacy tables untouched (rollback path).
  assert (select count(*) from public.nanny_profiles) = 4 and (select count(*) from public.matches) = 5
     and (select count(*) from public.messages) = 3, 'legacy tables intact';

  raise notice 'nanny migration checks: all passed';
end $$;
