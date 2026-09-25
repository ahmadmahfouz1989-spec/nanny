-- 20260923000004 blocked suspended accounts from sending messages and
-- creating posts at the RLS layer, but every other write a suspended user
-- could still make directly against Supabase (bypassing requireActiveUser
-- in the API routes) was left open: replying to feed posts, editing an
-- existing post's caption, liking, rating a match, and uploading into the
-- public photo buckets / voice-notes bucket. Report filing is closed in
-- 20260924000003 alongside that policy's other change. Deleting your own
-- content (posts, replies, likes, storage objects) stays allowed -- that
-- only ever shrinks a suspended account's footprint.
--
-- One helper instead of repeating the users lookup in each policy: it
-- reads only the caller's own row, and "explicitly active" (not merely
-- "not suspended") so a 'deleted' account is refused too -- matching
-- favorites_insert_own. Security definer with a pinned search_path, same
-- shape as account_is_suspended, so storage.objects policies can call it
-- without depending on the caller's search_path.
create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.users where id = auth.uid() and status = 'active');
$$;

grant execute on function public.current_user_is_active() to authenticated;

-- ─── feed ──────────────────────────────────────────────────────────────

drop policy posts_update on public.posts;
create policy posts_update on public.posts
  for update using (user_id = auth.uid() and public.current_user_is_active())
  with check (user_id = auth.uid() and public.current_user_is_active());

drop policy post_replies_insert on public.post_replies;
create policy post_replies_insert on public.post_replies
  for insert with check (
    user_id = auth.uid()
    and public.current_user_is_active()
    and exists (select 1 from public.posts p where p.id = post_id and p.status = 'open')
  );

drop policy post_likes_insert on public.post_likes;
create policy post_likes_insert on public.post_likes
  for insert with check (user_id = auth.uid() and public.current_user_is_active());

-- ─── ratings ───────────────────────────────────────────────────────────

drop policy ratings_insert on public.ratings;
create policy ratings_insert on public.ratings
  for insert with check (
    rater_user_id = auth.uid()
    and public.current_user_is_active()
    and rater_user_id <> ratee_user_id
    and exists (
      select 1 from public.matches m
      join public.parent_profiles pp on pp.id = m.parent_profile_id
      join public.nanny_profiles np on np.id = m.nanny_profile_id
      where m.id = ratings.match_id
        and m.status = 'mutual'
        and (
          (pp.user_id = auth.uid() and np.user_id = ratings.ratee_user_id)
          or (np.user_id = auth.uid() and pp.user_id = ratings.ratee_user_id)
        )
    )
  );

drop policy ratings_update on public.ratings;
create policy ratings_update on public.ratings
  for update using (rater_user_id = auth.uid() and public.current_user_is_active())
  with check (rater_user_id = auth.uid() and public.current_user_is_active());

drop policy generic_ratings_insert on public.generic_ratings;
create policy generic_ratings_insert on public.generic_ratings
  for insert with check (
    rater_user_id = auth.uid()
    and public.current_user_is_active()
    and rater_user_id <> ratee_user_id
    and exists (
      select 1 from public.generic_matches gm
      join public.generic_profiles seeker on seeker.id = gm.seeker_profile_id
      join public.generic_profiles provider on provider.id = gm.provider_profile_id
      where gm.id = generic_ratings.match_id
        and gm.status = 'mutual'
        and (
          (seeker.user_id = auth.uid() and provider.user_id = generic_ratings.ratee_user_id)
          or (provider.user_id = auth.uid() and seeker.user_id = generic_ratings.ratee_user_id)
        )
    )
  );

drop policy generic_ratings_update on public.generic_ratings;
create policy generic_ratings_update on public.generic_ratings
  for update using (rater_user_id = auth.uid() and public.current_user_is_active())
  with check (rater_user_id = auth.uid() and public.current_user_is_active());

-- ─── storage uploads ───────────────────────────────────────────────────
-- Both photo buckets are public, so an unguarded upload is free public
-- file hosting for a suspended account, not just a hidden profile photo.

drop policy nanny_photos_owner_write on storage.objects;
create policy nanny_photos_owner_write on storage.objects
  for insert with check (
    bucket_id = 'nanny-photos' and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_is_active()
  );

drop policy nanny_photos_owner_update on storage.objects;
create policy nanny_photos_owner_update on storage.objects
  for update using (
    bucket_id = 'nanny-photos' and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_is_active()
  );

drop policy parent_photos_owner_write on storage.objects;
create policy parent_photos_owner_write on storage.objects
  for insert with check (
    bucket_id = 'parent-photos' and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_is_active()
  );

drop policy parent_photos_owner_update on storage.objects;
create policy parent_photos_owner_update on storage.objects
  for update using (
    bucket_id = 'parent-photos' and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_is_active()
  );

drop policy voice_notes_owner_write on storage.objects;
create policy voice_notes_owner_write on storage.objects
  for insert with check (
    bucket_id = 'voice-notes' and (storage.foldername(name))[1] = auth.uid()::text
    and public.current_user_is_active()
  );
