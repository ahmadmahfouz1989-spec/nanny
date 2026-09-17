-- The feed is a shared timeline any authenticated user can post to,
-- regardless of category/role -- not just parent/nanny accounts. The
-- "I'm interested" front door into the matches table (which required this
-- restriction, since it assumed every post's author had a parent_profiles
-- or nanny_profiles row) is being removed at the app layer alongside this;
-- kind becomes a plain, freely-chosen label rather than a role-derived one.

drop policy posts_insert on public.posts;

create policy posts_insert on public.posts
  for insert with check (user_id = auth.uid());
