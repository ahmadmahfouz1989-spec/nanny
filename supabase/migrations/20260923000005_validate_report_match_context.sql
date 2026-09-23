-- 20260922000002_report_match_context.sql added match_id/match_source so a
-- report can point admin review at the exact conversation it's about, but
-- never extended reports_insert_own to validate them -- it still only
-- checks reporter_user_id = auth.uid(). POST /api/reports verifies match
-- participants before storing them (see verifyMatchParticipants there),
-- but that's an app-layer check a direct authenticated insert bypasses
-- entirely, letting a report name a match neither the reporter nor the
-- reported user was ever part of. The admin evidence endpoint currently
-- trusts a stored match_id outright (just checks the match row exists),
-- so a forged one would surface an unrelated couple's conversation as
-- "evidence" against the reported user.

-- Mirrors verifyMatchParticipants in src/app/api/reports/route.ts exactly,
-- as a security-definer function: reports_insert_own runs as the
-- reporting user, whose own RLS on parent_profiles/nanny_profiles/
-- generic_profiles only exposes their own row and whichever counterpart
-- profiles their own matches make visible -- not necessarily the specific
-- match/profiles being named here, so a plain nested exists() could
-- under-authorize a legitimate report. Bypassing RLS is safe: this only
-- ever returns a boolean, never row contents.
create or replace function public.report_match_participants_valid(
  p_match_id uuid,
  p_match_source text,
  p_reporter_user_id uuid,
  p_reported_user_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_parent_user_id uuid;
  v_nanny_user_id uuid;
  v_seeker_user_id uuid;
  v_provider_user_id uuid;
begin
  if p_match_source = 'nanny' then
    select pp.user_id, np.user_id into v_parent_user_id, v_nanny_user_id
    from public.matches m
    join public.parent_profiles pp on pp.id = m.parent_profile_id
    join public.nanny_profiles np on np.id = m.nanny_profile_id
    where m.id = p_match_id;

    return v_parent_user_id is not null
      and ((v_parent_user_id = p_reporter_user_id and v_nanny_user_id = p_reported_user_id)
        or (v_nanny_user_id = p_reporter_user_id and v_parent_user_id = p_reported_user_id));
  end if;

  select seeker.user_id, provider.user_id into v_seeker_user_id, v_provider_user_id
  from public.generic_matches gm
  join public.generic_profiles seeker on seeker.id = gm.seeker_profile_id
  join public.generic_profiles provider on provider.id = gm.provider_profile_id
  where gm.id = p_match_id;

  return v_seeker_user_id is not null
    and ((v_seeker_user_id = p_reporter_user_id and v_provider_user_id = p_reported_user_id)
      or (v_provider_user_id = p_reporter_user_id and v_seeker_user_id = p_reported_user_id));
end;
$$;

drop policy reports_insert_own on public.reports;
create policy reports_insert_own on public.reports
  for insert with check (
    auth.uid() = reporter_user_id
    and (
      (match_id is null and match_source is null)
      or (
        match_id is not null and match_source is not null
        and public.report_match_participants_valid(match_id, match_source, reporter_user_id, reported_user_id)
      )
    )
  );
