-- Voice notes in chat. Unlike nanny-photos (public bucket), a voice note
-- is private to the two people in the match -- there's no select policy
-- on the bucket at all. Reads only ever happen through the service role
-- inside api/matches/[id]/messages, which already verifies match
-- participancy + mutual status before minting a short-lived signed URL,
-- the same reasoning ratings/featured-status use the admin client for.

alter table public.messages add column audio_path text;
alter table public.messages add column audio_duration_seconds smallint;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice-notes', 'voice-notes', false, 5242880, array['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg']);

-- Upload/delete follow the same "first path segment is your own user id"
-- convention as nanny-photos -- who can later *read* a note is a separate
-- question, answered entirely by the app route above, not by storage RLS.
create policy voice_notes_owner_write on storage.objects
  for insert with check (
    bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy voice_notes_owner_delete on storage.objects
  for delete using (
    bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text
  );
