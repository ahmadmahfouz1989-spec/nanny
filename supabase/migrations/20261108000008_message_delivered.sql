-- WhatsApp-style ticks in chat: sent (one), delivered (two grey), read (two
-- blue). delivered_at is set when the recipient's app or website next
-- checks in (mark_messages_delivered, called by /api/inbox, which every
-- page polls), and at the latest when they read it.

alter table public.generic_messages add column if not exists delivered_at timestamptz;

-- History: what's been read was delivered then; the rest, when it was sent.
update public.generic_messages set delivered_at = coalesce(read_at, created_at) where delivered_at is null;

create index if not exists generic_messages_undelivered_idx on public.generic_messages (match_id) where delivered_at is null;

-- Reading implies it arrived.
create or replace function public.message_delivered_when_read()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.read_at is not null and new.delivered_at is null then
    new.delivered_at := new.read_at;
  end if;
  return new;
end;
$$;

drop trigger if exists generic_messages_delivered_when_read on public.generic_messages;
create trigger generic_messages_delivered_when_read
  before update of read_at on public.generic_messages
  for each row execute function public.message_delivered_when_read();

-- Everything sent to this person that hadn't reached them yet, now has.
create or replace function public.mark_messages_delivered(p_user uuid)
returns integer
language sql
security definer set search_path = public
as $$
  with mine as (
    select gm.id
    from public.generic_matches gm
    join public.generic_profiles s on s.id = gm.seeker_profile_id
    join public.generic_profiles p on p.id = gm.provider_profile_id
    where s.user_id = p_user or p.user_id = p_user
  ), done as (
    update public.generic_messages m
    set delivered_at = now()
    where m.delivered_at is null
      and m.sender_id <> p_user
      and m.match_id in (select id from mine)
    returning 1
  )
  select count(*)::integer from done;
$$;
revoke all on function public.mark_messages_delivered(uuid) from public, anon, authenticated;
grant execute on function public.mark_messages_delivered(uuid) to service_role;
