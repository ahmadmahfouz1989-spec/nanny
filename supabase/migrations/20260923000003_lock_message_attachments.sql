-- protect_message_mutation/protect_generic_message_mutation were meant to
-- lock every column except read_at once a message exists (messages_mark_read
-- /generic_messages_mark_read grant the recipient row-level UPDATE access
-- for exactly that purpose). audio_path and audio_duration_seconds were
-- added later (20260914000001_voice_notes.sql,
-- 20260920000002_generic_voice_notes.sql) and never added to either
-- trigger, so a recipient marking a message read could also rewrite its
-- audio_path to point at an unrelated voice note (their own upload, or any
-- other path they can guess/observe) -- the chat UI and admin evidence
-- endpoint would then sign and render it as if it were the original
-- sender's attachment. Uses `is distinct from`, not `<>`, since both
-- columns are nullable (a text-only message has neither set).

create or replace function public.protect_message_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id or new.match_id <> old.match_id or new.sender_id <> old.sender_id
     or new.body <> old.body or new.created_at <> old.created_at
     or new.audio_path is distinct from old.audio_path
     or new.audio_duration_seconds is distinct from old.audio_duration_seconds then
    raise exception 'only read_at may be updated on a message';
  end if;
  return new;
end;
$$;

create or replace function public.protect_generic_message_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id or new.match_id <> old.match_id or new.sender_id <> old.sender_id
     or new.body <> old.body or new.created_at <> old.created_at
     or new.audio_path is distinct from old.audio_path
     or new.audio_duration_seconds is distinct from old.audio_duration_seconds then
    raise exception 'only read_at may be updated on a message';
  end if;
  return new;
end;
$$;

-- Defense in depth alongside the trigger: authenticated has no legitimate
-- reason to UPDATE anything but read_at on either table (the trigger is
-- what actually enforces this, since GRANT has no per-row awareness, but a
-- column-scoped grant means a future policy change can't reopen this
-- silently the way the missing trigger columns just did).
revoke update on public.messages from authenticated;
grant update (read_at) on public.messages to authenticated;

revoke update on public.generic_messages from authenticated;
grant update (read_at) on public.generic_messages to authenticated;
