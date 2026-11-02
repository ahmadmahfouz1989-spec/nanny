-- Reading profiles and the feed through the database API now needs a
-- signed-in account. Until now the public (anon) key -- which ships in the
-- website's JavaScript -- could list every approved profile with all its
-- attributes, families' included (children's ages, street detail,
-- nationality...), and every open post, without an account.
--
-- What signed-out visitors may see is served by the server instead, from
-- a fixed set of safe fields: approved providers only (the public profile
-- page and browsing -- src/lib/public-profile.ts, src/lib/public-browse.ts).

alter policy generic_profiles_select on public.generic_profiles to authenticated;
alter policy generic_profiles_select_mutual_match on public.generic_profiles to authenticated;
alter policy posts_select on public.posts to authenticated;
alter policy post_replies_select on public.post_replies to authenticated;
alter policy post_likes_select on public.post_likes to authenticated;
