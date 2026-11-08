-- Photos on Home posts (up to 4), picked from the phone or taken with the
-- camera. Files go to the public post-photos bucket under the poster's own
-- folder through /api/post-photos (service role); a post may only list
-- photos from its own author's folder there -- no outside links.

alter table public.posts
  add column if not exists photo_urls text[] not null default '{}' check (cardinality(photo_urls) <= 4);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('post-photos', 'post-photos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;

create or replace function public.check_post_photos()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  url text;
begin
  foreach url in array coalesce(new.photo_urls, '{}') loop
    if position('/storage/v1/object/public/post-photos/' || new.user_id::text || '/' in url) = 0 then
      raise exception 'A post can only show photos its author uploaded';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists posts_check_photos on public.posts;
create trigger posts_check_photos
  before insert or update of photo_urls on public.posts
  for each row execute function public.check_post_photos();
