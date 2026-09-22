-- Editing an approved profile resets its moderation_status to 'pending'
-- (protect_moderation_status trigger) until an admin re-approves it. The
-- existing counterpart SELECT policies on
-- parent_profiles/nanny_profiles/generic_profiles only expose an
-- 'active'+'approved' profile to someone other than its owner -- correct
-- for public discovery/search, but resolveMatchAccess/
-- resolveGenericMatchAccess resolve the counterpart's user id through this
-- same policy, and messages_select/messages_insert/messages_mark_read
-- (plus their generic_* equivalents) independently JOIN through these same
-- tables to confirm match participancy. All of them silently stop
-- resolving the counterpart the moment either side edits their profile,
-- turning an established mutual match into "not found" and locking both
-- sides out of a conversation that was already happening, until
-- moderation catches up -- which can take arbitrarily long.
--
-- The natural policy shape ("exists a mutual match row linking this
-- profile to my own") can't be written directly as a plain USING clause:
-- it queries matches/generic_matches, whose own SELECT policy queries
-- parent_profiles/nanny_profiles/generic_profiles again, which would
-- re-trigger this same new policy -- Postgres detects that cycle and
-- raises "infinite recursion detected in policy for relation ...". A
-- SECURITY DEFINER function breaks the cycle: the checks inside it run as
-- the function owner (not the restricted calling role), so they don't
-- re-enter the caller's RLS at all. Each returns a single boolean with no
-- row data, so it can't be used to exfiltrate anything beyond "yes/no".

create or replace function public.is_parent_profile_mutual_counterpart(p_parent_profile_id uuid, p_caller_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.matches m
    join public.nanny_profiles np on np.id = m.nanny_profile_id
    where m.parent_profile_id = p_parent_profile_id
      and m.status = 'mutual'
      and np.user_id = p_caller_user_id
  );
$$;

create or replace function public.is_nanny_profile_mutual_counterpart(p_nanny_profile_id uuid, p_caller_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.matches m
    join public.parent_profiles pp on pp.id = m.parent_profile_id
    where m.nanny_profile_id = p_nanny_profile_id
      and m.status = 'mutual'
      and pp.user_id = p_caller_user_id
  );
$$;

create or replace function public.is_generic_profile_mutual_counterpart(p_profile_id uuid, p_caller_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.generic_matches gm
    where gm.status = 'mutual'
      and (
        (gm.seeker_profile_id = p_profile_id and exists (
          select 1 from public.generic_profiles me where me.id = gm.provider_profile_id and me.user_id = p_caller_user_id
        ))
        or
        (gm.provider_profile_id = p_profile_id and exists (
          select 1 from public.generic_profiles me where me.id = gm.seeker_profile_id and me.user_id = p_caller_user_id
        ))
      )
  );
$$;

grant execute on function public.is_parent_profile_mutual_counterpart to authenticated;
grant execute on function public.is_nanny_profile_mutual_counterpart to authenticated;
grant execute on function public.is_generic_profile_mutual_counterpart to authenticated;

-- Purely additive (RLS policies for the same command OR together) --
-- nothing already granted is narrowed, and it can't expose a profile to
-- anyone who isn't genuinely the other side of a match that both parties
-- already agreed to.

create policy parent_profiles_select_mutual_match on public.parent_profiles
  for select using (public.is_parent_profile_mutual_counterpart(id, auth.uid()));

create policy nanny_profiles_select_mutual_match on public.nanny_profiles
  for select using (public.is_nanny_profile_mutual_counterpart(id, auth.uid()));

create policy generic_profiles_select_mutual_match on public.generic_profiles
  for select using (public.is_generic_profile_mutual_counterpart(id, auth.uid()));
