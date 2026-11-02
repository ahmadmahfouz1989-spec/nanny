-- Posting and replying in the feed need a profile. Accounts with none
-- showed up as "Someone" -- nobody could see who they were dealing with.
-- The API already refuses them (src/app/api/posts); this holds the same
-- rule for anyone writing to the tables directly with their own session.
-- Existing rows are untouched (the feed hides profileless posts).

drop policy posts_insert on public.posts;
create policy posts_insert on public.posts
  for insert with check (
    user_id = auth.uid()
    and public.current_user_is_active()
    and posted_as_parent_profile_id is null
    and posted_as_nanny_profile_id is null
    and posted_as_generic_profile_id is not null
    and exists (
      select 1 from public.generic_profiles g
      where g.id = posted_as_generic_profile_id and g.user_id = auth.uid() and g.status <> 'draft'
    )
  );

drop policy post_replies_insert on public.post_replies;
create policy post_replies_insert on public.post_replies
  for insert with check (
    user_id = auth.uid()
    and public.current_user_is_active()
    and exists (select 1 from public.posts p where p.id = post_id and p.status = 'open')
    and exists (select 1 from public.generic_profiles g where g.user_id = auth.uid() and g.status <> 'draft')
  );
