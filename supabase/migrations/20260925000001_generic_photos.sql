-- Profile photos for generic-category profiles (nursing, tutoring, ...),
-- closing the last visible gap with nanny/parent. Optional, like
-- parent photos. A separate bucket, same as parent-photos was, so nothing
-- about an existing nanny/parent photo's path/URL changes.

alter table public.generic_profiles add column profile_photo_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('generic-photos', 'generic-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- Same "first path segment is your own user id" + active-account rules as
-- the other photo buckets (see 20260924000002_suspension_all_write_paths).
create policy generic_photos_owner_write on storage.objects
  for insert with check (
    bucket_id = 'generic-photos' and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_is_active()
  );

create policy generic_photos_owner_update on storage.objects
  for update using (
    bucket_id = 'generic-photos' and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_is_active()
  );

create policy generic_photos_owner_delete on storage.objects
  for delete using (
    bucket_id = 'generic-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy generic_photos_public_read on storage.objects
  for select using (bucket_id = 'generic-photos');

-- generic_profiles_write_own lets an owner write any column directly, so
-- without this a client could point profile_photo_url at an arbitrary
-- image (or another account's photo) and skip the upload route entirely.
-- Only ever accept a URL into this user's own folder of this bucket.
create or replace function public.protect_generic_profile_photo()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'service_role' or new.profile_photo_url is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.profile_photo_url is not distinct from old.profile_photo_url then
    return new;
  end if;
  if position('/storage/v1/object/public/generic-photos/' || new.user_id::text || '/' in new.profile_photo_url) = 0 then
    raise exception 'profile_photo_url must point to your own uploaded photo';
  end if;
  return new;
end;
$$;

create trigger generic_profiles_protect_photo
  before insert or update on public.generic_profiles
  for each row execute function public.protect_generic_profile_photo();
