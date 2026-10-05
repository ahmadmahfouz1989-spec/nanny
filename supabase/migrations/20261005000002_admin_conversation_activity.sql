-- Admin "Activity" page: who is talking to whom and how much -- never what
-- they said. Message contents stay visible to admins only through a
-- report (see /api/admin/reports/[id]/messages).
--
-- Both functions are read-only and callable by the service role only (the
-- admin API routes); signed-in users and anonymous visitors can't run them.

create or replace function public.admin_conversations(
  p_category text default null,
  p_active_since timestamptz default null,
  p_limit int default 50,
  p_offset int default 0
)
returns table (
  match_id uuid,
  category_slug text,
  category_name_en text,
  category_name_ar text,
  seeker_profile_id uuid,
  seeker_name text,
  provider_profile_id uuid,
  provider_name text,
  started_by_side text,
  messages bigint,
  from_seeker bigint,
  from_provider bigint,
  started_at timestamptz,
  last_message_at timestamptz,
  status text,
  total_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with convo as (
    select gm.id, gm.status, gm.started_by, gm.started_at, gm.last_message_at,
           gm.seeker_profile_id, gm.provider_profile_id,
           c.slug, c.name_en, c.name_ar,
           s.full_name as seeker_name, s.user_id as seeker_user_id,
           p.full_name as provider_name, p.user_id as provider_user_id
    from public.generic_matches gm
    join public.categories c on c.id = gm.category_id
    join public.generic_profiles s on s.id = gm.seeker_profile_id
    join public.generic_profiles p on p.id = gm.provider_profile_id
    where gm.last_message_at is not null
      and (p_category is null or c.slug = p_category)
      and (p_active_since is null or gm.last_message_at >= p_active_since)
  )
  select
    cv.id,
    cv.slug,
    cv.name_en,
    cv.name_ar,
    cv.seeker_profile_id,
    cv.seeker_name,
    cv.provider_profile_id,
    cv.provider_name,
    case
      when cv.started_by = cv.seeker_user_id then 'seeker'
      when cv.started_by = cv.provider_user_id then 'provider'
    end,
    (select count(*) from public.generic_messages m where m.match_id = cv.id),
    (select count(*) from public.generic_messages m where m.match_id = cv.id and m.sender_id = cv.seeker_user_id),
    (select count(*) from public.generic_messages m where m.match_id = cv.id and m.sender_id = cv.provider_user_id),
    cv.started_at,
    cv.last_message_at,
    cv.status,
    count(*) over ()
  from convo cv
  order by cv.last_message_at desc, cv.id
  limit greatest(1, least(p_limit, 200))
  offset greatest(0, p_offset);
$$;

-- Headline numbers for the same page. "Two-way" = both sides have written
-- at least once, i.e. the conversation actually went somewhere.
create or replace function public.admin_conversation_stats(p_since timestamptz)
returns table (
  conversations bigint,
  two_way bigint,
  started_since bigint,
  messages_since bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.generic_matches where last_message_at is not null),
    (select count(*)
       from public.generic_matches gm
       join public.generic_profiles s on s.id = gm.seeker_profile_id
       join public.generic_profiles p on p.id = gm.provider_profile_id
      where gm.last_message_at is not null
        and exists (select 1 from public.generic_messages m where m.match_id = gm.id and m.sender_id = s.user_id)
        and exists (select 1 from public.generic_messages m where m.match_id = gm.id and m.sender_id = p.user_id)),
    (select count(*) from public.generic_matches where started_at >= p_since),
    (select count(*) from public.generic_messages where created_at >= p_since);
$$;

revoke all on function public.admin_conversations(text, timestamptz, int, int) from public, anon, authenticated;
revoke all on function public.admin_conversation_stats(timestamptz) from public, anon, authenticated;
grant execute on function public.admin_conversations(text, timestamptz, int, int) to service_role;
grant execute on function public.admin_conversation_stats(timestamptz) to service_role;
