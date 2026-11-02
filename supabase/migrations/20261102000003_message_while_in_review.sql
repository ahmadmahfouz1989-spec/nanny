-- Someone whose own profile is still waiting for review can start a
-- conversation. The person they approach must still be live and approved,
-- and the sender's own profile must be submitted (not a draft, paused or
-- rejected). Before this, a new customer saw a Message button, wrote a
-- message, and got "this profile isn't available" -- about their own
-- profile, not the other person's.

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
    -- The person being approached: live and approved.
    if exists (
      select 1 from public.generic_profiles p
      where p.id in (m.seeker_profile_id, m.provider_profile_id)
        and p.user_id <> new.sender_id
        and (p.status <> 'active' or p.moderation_status <> 'approved')
    ) then
      raise exception 'profile_not_available';
    end if;

    -- The sender: submitted, and approved or still waiting for review.
    if exists (
      select 1 from public.generic_profiles p
      where p.id in (m.seeker_profile_id, m.provider_profile_id)
        and p.user_id = new.sender_id
        and (p.status <> 'active' or p.moderation_status not in ('approved', 'pending'))
    ) then
      raise exception 'own_profile_not_ready';
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
