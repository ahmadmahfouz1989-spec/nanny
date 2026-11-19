-- Apps from 1.6: Android shows the missed-call notification itself (with
-- Call back and Message buttons), so the server sends it as data to those
-- installs only; and the iPhone icon shows how much is waiting.

alter table public.native_push_tokens
  add column if not exists missed_call_actions boolean not null default false;

-- Unread messages plus missed calls not looked at yet: the number on the
-- app icon (the Messages badge, src/components/matches/messages-nav-item.tsx).
create or replace function public.app_badge_count(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    select count(*)
    from public.generic_messages m
    join public.generic_matches gm on gm.id = m.match_id
    join public.generic_profiles p on p.id in (gm.seeker_profile_id, gm.provider_profile_id) and p.user_id = p_user
    where m.sender_id <> p_user
      and m.read_at is null
      and gm.status not like 'declined_by_%'
  )::integer + (
    select count(*)
    from public.calls c
    where c.callee_id = p_user and c.seen_at is null and c.status in ('missed', 'busy')
  )::integer;
$$;

revoke all on function public.app_badge_count(uuid) from public, anon, authenticated;
grant execute on function public.app_badge_count(uuid) to service_role;
