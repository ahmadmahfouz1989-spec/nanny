-- Photos in chat: a picture of the leak, the stain or the dent says more
-- than a paragraph. Private like voice notes: no select policy on the
-- bucket; the messages route checks the person is in the conversation
-- before signing a short-lived link (see api/generic-matches/[id]/messages).

alter table public.generic_messages add column image_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-photos', 'chat-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy chat_photos_owner_write on storage.objects
  for insert with check (
    bucket_id = 'chat-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy chat_photos_owner_delete on storage.objects
  for delete using (
    bucket_id = 'chat-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
