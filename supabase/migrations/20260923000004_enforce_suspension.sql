-- requireActiveUser (src/lib/session.ts) blocks a suspended account at the
-- Next.js API layer, but that guard is opt-in per route and RLS/grants
-- underneath it never checked status at all -- a suspended user calling
-- Supabase directly (or a route that predates requireActiveUser) could
-- still send messages, post to the feed, and their still-approved
-- profiles stayed fully visible/matchable to everyone else. This closes
-- those gaps at the database layer, which is the actual backstop.

-- ─── messages / generic_messages: block suspended senders ─────────────────
-- Same pattern already used by these policies' own mutual-match check
-- (`u.id = auth.uid()`) -- checking your own users row passes
-- users_select_own, no recursion/visibility issue, no security-definer
-- helper needed.

drop policy messages_insert on public.messages;
create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.status <> 'suspended')
    and exists (
      select 1 from public.matches m
      join public.parent_profiles pp on pp.id = m.parent_profile_id
      join public.nanny_profiles np on np.id = m.nanny_profile_id
      where m.id = messages.match_id
        and m.status = 'mutual'
        and (pp.user_id = auth.uid() or np.user_id = auth.uid())
    )
  );

drop policy generic_messages_insert on public.generic_messages;
create policy generic_messages_insert on public.generic_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.status <> 'suspended')
    and exists (
      select 1 from public.generic_matches gm
      join public.generic_profiles seeker on seeker.id = gm.seeker_profile_id
      join public.generic_profiles provider on provider.id = gm.provider_profile_id
      where gm.id = generic_messages.match_id
        and gm.status = 'mutual'
        and (seeker.user_id = auth.uid() or provider.user_id = auth.uid())
    )
  );

-- ─── posts: block suspended posters ────────────────────────────────────────

drop policy posts_insert on public.posts;
create policy posts_insert on public.posts
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.users u where u.id = auth.uid() and u.status <> 'suspended')
    and (
      (posted_as_parent_profile_id is null and posted_as_nanny_profile_id is null and posted_as_generic_profile_id is null)
      or (posted_as_parent_profile_id is not null and exists (
        select 1 from public.parent_profiles p
        where p.id = posted_as_parent_profile_id and p.user_id = auth.uid() and p.status <> 'draft'
      ))
      or (posted_as_nanny_profile_id is not null and exists (
        select 1 from public.nanny_profiles n
        where n.id = posted_as_nanny_profile_id and n.user_id = auth.uid() and n.status <> 'draft'
      ))
      or (posted_as_generic_profile_id is not null and exists (
        select 1 from public.generic_profiles g
        where g.id = posted_as_generic_profile_id and g.user_id = auth.uid() and g.status <> 'draft'
      ))
    )
  );

-- ─── profile visibility: hide suspended owners' profiles from others ──────
-- Unlike the checks above, this needs to look up a DIFFERENT user's row
-- (the profile owner, not auth.uid()) -- users_select_own only allows
-- selecting your own row, so a plain nested exists() here would silently
-- always evaluate false for anyone but the owner. A security-definer
-- helper is the same escape hatch already used elsewhere in this schema
-- (e.g. mutual-match counterpart checks) to answer a narrow yes/no
-- question about another user without exposing their row.
create or replace function public.account_is_suspended(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.users where id = check_user_id and status = 'suspended');
$$;

drop policy parent_profiles_select on public.parent_profiles;
create policy parent_profiles_select on public.parent_profiles
  for select using (
    auth.uid() = user_id
    or (
      status = 'active' and moderation_status = 'approved'
      and not public.account_is_suspended(user_id)
      and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'nanny')
    )
  );

drop policy nanny_profiles_select on public.nanny_profiles;
create policy nanny_profiles_select on public.nanny_profiles
  for select using (
    auth.uid() = user_id
    or (
      status = 'active' and moderation_status = 'approved'
      and not public.account_is_suspended(user_id)
      and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'parent')
    )
  );

drop policy generic_profiles_select on public.generic_profiles;
create policy generic_profiles_select on public.generic_profiles
  for select using (
    user_id = auth.uid()
    or (status = 'active' and moderation_status = 'approved' and not public.account_is_suspended(user_id))
  );
