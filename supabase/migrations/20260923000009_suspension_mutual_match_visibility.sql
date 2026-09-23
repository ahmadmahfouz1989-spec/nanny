-- 20260923000004_enforce_suspension.sql added a suspension check to
-- parent_profiles_select/nanny_profiles_select/generic_profiles_select,
-- but missed that each of those tables also carries a SEPARATE, purely
-- additive SELECT policy from 20260922000003_mutual_match_profile_visibility.sql
-- (parent_profiles_select_mutual_match etc.) -- Postgres ORs multiple
-- permissive policies for the same command together, so that second
-- policy's own lack of a suspension check let a suspended account's
-- approved profile stay fully visible to its existing match counterpart
-- regardless of what the first policy now says. Extending the
-- is_*_profile_mutual_counterpart functions themselves (rather than the
-- policies) fixes this at the one place both directions of the check
-- belong: the profile being viewed must not belong to a suspended owner,
-- and the viewer's own account must not be suspended either -- confirmed
-- live: without this, a suspended parent's profile stayed visible to
-- their own mutual-matched nanny.
create or replace function public.is_parent_profile_mutual_counterpart(p_parent_profile_id uuid, p_caller_user_id uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.matches m
    join public.nanny_profiles np on np.id = m.nanny_profile_id
    join public.parent_profiles pp on pp.id = m.parent_profile_id
    where m.parent_profile_id = p_parent_profile_id
      and m.status = 'mutual'
      and np.user_id = p_caller_user_id
      and not public.account_is_suspended(pp.user_id)
      and not public.account_is_suspended(p_caller_user_id)
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
    join public.nanny_profiles np on np.id = m.nanny_profile_id
    where m.nanny_profile_id = p_nanny_profile_id
      and m.status = 'mutual'
      and pp.user_id = p_caller_user_id
      and not public.account_is_suspended(np.user_id)
      and not public.account_is_suspended(p_caller_user_id)
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
    join public.generic_profiles target on target.id = p_profile_id
    where gm.status = 'mutual'
      and not public.account_is_suspended(target.user_id)
      and not public.account_is_suspended(p_caller_user_id)
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
