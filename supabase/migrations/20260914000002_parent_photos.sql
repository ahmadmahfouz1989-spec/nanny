-- Parents can now have a profile photo too -- optional, unlike nanny
-- profiles (which require one before they can go active). A separate
-- bucket rather than reusing nanny-photos, so nothing about an existing
-- nanny photo's path/URL changes.

alter table public.parent_profiles add column profile_photo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('parent-photos', 'parent-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy parent_photos_owner_write on storage.objects
  for insert with check (
    bucket_id = 'parent-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy parent_photos_owner_update on storage.objects
  for update using (
    bucket_id = 'parent-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy parent_photos_owner_delete on storage.objects
  for delete using (
    bucket_id = 'parent-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy parent_photos_public_read on storage.objects
  for select using (bucket_id = 'parent-photos');
