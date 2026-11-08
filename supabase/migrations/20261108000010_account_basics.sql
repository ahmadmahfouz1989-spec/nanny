-- The basics asked once, right after sign-up ("About you"): name (already
-- users.full_name), contact phone (users.contact_phone), nationality and a
-- photo. Service forms then ask only what that service needs, and copy
-- these onto each profile. Written by the app's API (service role).

alter table public.users
  add column if not exists nationality text,
  add column if not exists photo_url text;

-- Existing accounts: from the profiles they already have.
update public.users u
set nationality = coalesce(u.nationality, (
      select g.attributes->>'nationality' from public.generic_profiles g
      where g.user_id = u.id and g.status <> 'draft' and coalesce(g.attributes->>'nationality', '') <> ''
      order by g.updated_at desc limit 1)),
    photo_url = coalesce(u.photo_url, (
      select g.profile_photo_url from public.generic_profiles g
      where g.user_id = u.id and g.status <> 'draft' and g.profile_photo_url is not null
      order by g.updated_at desc limit 1));
