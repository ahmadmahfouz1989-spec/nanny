-- validate_generic_match_profiles checked role and category correctness
-- but never that the two profiles belong to different accounts. Since a
-- single user_id can hold both a seeker and a provider profile in the
-- same category (e.g. someone who tutors and also seeks a tutor for
-- their own kid), the matching engine would happily compute a match
-- between someone's own two profiles -- verified this produced a 100%
-- score self-match in testing. The application-layer fix (excluding
-- same-user candidates in generic-recompute.ts) is what actually stops
-- new ones from being created; this trigger is the DB-level backstop so
-- no other code path can insert one either.

create or replace function public.validate_generic_match_profiles()
returns trigger
language plpgsql
as $$
declare
  v_seeker public.generic_profiles;
  v_provider public.generic_profiles;
begin
  select * into v_seeker from public.generic_profiles where id = new.seeker_profile_id;
  select * into v_provider from public.generic_profiles where id = new.provider_profile_id;

  if v_seeker.role <> 'seeker' or v_provider.role <> 'provider' then
    raise exception 'generic_matches requires a seeker profile and a provider profile';
  end if;
  if v_seeker.category_id <> new.category_id or v_provider.category_id <> new.category_id then
    raise exception 'both profiles must belong to the match''s category';
  end if;
  if v_seeker.user_id = v_provider.user_id then
    raise exception 'a generic_matches row cannot match an account with itself';
  end if;
  return new;
end;
$$;

-- Clean up any self-matches (and their messages/ratings, via cascade)
-- that were already created before this fix.
delete from public.generic_matches gm
using public.generic_profiles s, public.generic_profiles p
where s.id = gm.seeker_profile_id
  and p.id = gm.provider_profile_id
  and s.user_id = p.user_id;
