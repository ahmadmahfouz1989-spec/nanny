-- Open messaging: anyone can message any match straight away, instead of
-- chat unlocking only after both sides send interest. Phone numbers are no
-- longer revealed by the app at all -- people share them in chat if they
-- want to.
--
-- What replaces the "both said yes" barrier:
--   * declined_by_* now means "blocked": no new messages either way.
--   * Starting a conversation (sending the first message of a match) is
--     capped at 30 a day per account, and needs both profiles to be live
--     and approved at that moment. Replies are never limited.
--   * Ratings need at least one message from each side.
--
-- Safe to apply before the app code that uses it: it only relaxes who may
-- message, and the old app's interest buttons keep working on rows that
-- still carry the old statuses.

-- ─── conversation bookkeeping on the match ──────────────────────────────

alter table public.generic_matches
  add column last_message_at timestamptz,
  add column started_by uuid references auth.users(id) on delete set null,
  add column started_at timestamptz;

create index generic_matches_started_by_idx on public.generic_matches(started_by, started_at);
create index generic_matches_last_message_idx on public.generic_matches(last_message_at) where last_message_at is not null;

update public.generic_matches gm
set last_message_at = s.last_at, started_by = s.first_sender, started_at = s.first_at
from (
  select distinct on (match_id)
    match_id,
    sender_id as first_sender,
    created_at as first_at,
    max(created_at) over (partition by match_id) as last_at
  from public.generic_messages
  order by match_id, created_at, id
) s
where s.match_id = gm.id;

-- Half-finished interest no longer means anything: those matches are just
-- open. 'mutual' stays as it is (an open match that also happens to have
-- an old "both said yes" behind it).
update public.generic_matches
set status = 'suggested', initiated_by = null, interest_expires_at = null
where status in ('seeker_interested', 'provider_interested', 'expired');

-- ─── sending a message ─────────────────────────────────────────────────

create or replace function public.before_generic_message_insert()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  m record;
  started_today int;
begin
  select gm.status, gm.started_by, gm.seeker_profile_id, gm.provider_profile_id
  into m
  from public.generic_matches gm
  where gm.id = new.match_id
  for update;

  if m.status like 'declined_by_%' then
    raise exception 'conversation_blocked';
  end if;

  if m.started_by is null then
    -- Only live, approved profiles can be approached; an ongoing
    -- conversation carries on even if one side's profile goes back into
    -- review after an edit.
    if exists (
      select 1 from public.generic_profiles p
      where p.id in (m.seeker_profile_id, m.provider_profile_id)
        and (p.status <> 'active' or p.moderation_status <> 'approved')
    ) then
      raise exception 'profile_not_available';
    end if;

    select count(*) into started_today
    from public.generic_matches
    where started_by = new.sender_id and started_at > now() - interval '24 hours';

    if started_today >= 30 then
      raise exception 'new_conversation_limit';
    end if;

    update public.generic_matches
    set started_by = new.sender_id, started_at = now(), last_message_at = now()
    where id = new.match_id;
  else
    update public.generic_matches set last_message_at = now() where id = new.match_id;
  end if;

  return new;
end;
$$;

create trigger generic_messages_before_insert
  before insert on public.generic_messages
  for each row execute function public.before_generic_message_insert();

-- Reading stays allowed after a block (the history doesn't disappear);
-- writing needs the match not to be blocked.
drop policy generic_messages_select on public.generic_messages;
create policy generic_messages_select on public.generic_messages
  for select using (
    exists (
      select 1 from public.generic_matches gm
      join public.generic_profiles seeker on seeker.id = gm.seeker_profile_id
      join public.generic_profiles provider on provider.id = gm.provider_profile_id
      where gm.id = generic_messages.match_id
        and (seeker.user_id = auth.uid() or provider.user_id = auth.uid())
    )
  );

drop policy generic_messages_insert on public.generic_messages;
create policy generic_messages_insert on public.generic_messages
  for insert with check (
    sender_id = auth.uid()
    and public.current_user_is_active()
    and exists (
      select 1 from public.generic_matches gm
      join public.generic_profiles seeker on seeker.id = gm.seeker_profile_id
      join public.generic_profiles provider on provider.id = gm.provider_profile_id
      where gm.id = generic_messages.match_id
        and gm.status not like 'declined_by_%'
        and (seeker.user_id = auth.uid() or provider.user_id = auth.uid())
    )
  );

drop policy generic_messages_mark_read on public.generic_messages;
create policy generic_messages_mark_read on public.generic_messages
  for update using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.generic_matches gm
      join public.generic_profiles seeker on seeker.id = gm.seeker_profile_id
      join public.generic_profiles provider on provider.id = gm.provider_profile_id
      where gm.id = generic_messages.match_id
        and (seeker.user_id = auth.uid() or provider.user_id = auth.uid())
    )
  )
  with check (sender_id <> auth.uid());

-- ─── ratings: only people who actually talked ─────────────────────────

drop policy generic_ratings_insert on public.generic_ratings;
create policy generic_ratings_insert on public.generic_ratings
  for insert with check (
    rater_user_id = auth.uid()
    and public.current_user_is_active()
    and rater_user_id <> ratee_user_id
    and exists (
      select 1 from public.generic_matches gm
      join public.generic_profiles seeker on seeker.id = gm.seeker_profile_id
      join public.generic_profiles provider on provider.id = gm.provider_profile_id
      where gm.id = generic_ratings.match_id
        and (
          (seeker.user_id = auth.uid() and provider.user_id = generic_ratings.ratee_user_id)
          or (provider.user_id = auth.uid() and seeker.user_id = generic_ratings.ratee_user_id)
        )
    )
    and exists (select 1 from public.generic_messages msg where msg.match_id = generic_ratings.match_id and msg.sender_id = auth.uid())
    and exists (select 1 from public.generic_messages msg where msg.match_id = generic_ratings.match_id and msg.sender_id = generic_ratings.ratee_user_id)
  );

-- ─── profile visibility inside a conversation ─────────────────────────
-- Was "has a mutual match". Now: has an unblocked conversation, so editing
-- a profile (which sends it back to review) doesn't make it vanish from
-- the people already talking to it.

create or replace function public.is_generic_profile_mutual_counterpart(p_profile_id uuid, p_caller_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.generic_matches gm
    join public.generic_profiles target on target.id = p_profile_id
    where gm.last_message_at is not null
      and gm.status not like 'declined_by_%'
      and not public.account_is_suspended(target.user_id)
      and not public.account_is_suspended(p_caller_user_id)
      and (
        (gm.seeker_profile_id = p_profile_id and exists (
          select 1 from public.generic_profiles me where me.id = gm.provider_profile_id and me.user_id = p_caller_user_id
        ))
        or
        (gm.provider_profile_id = p_profile_id and exists (
          select 1 from public.generic_profiles me where me.id = gm.seeker_profile_id and me.user_id = p_caller_user_id
        ))
      )
  );
$$;
