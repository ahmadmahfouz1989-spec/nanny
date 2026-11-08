-- A finished delivery or repair job can be rated, even if the two never
-- messaged each other (until now rating needed a message from each side).
-- The order is the real exchange: completed, on this conversation, between
-- these two people.
-- Orders aren't readable by users directly (everything goes through the
-- app's API), so the policy asks this instead.
create or replace function public.completed_order_between(p_match_id uuid, p_rater uuid, p_ratee uuid)
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select exists (
    select 1 from public.errand_orders o
    where o.generic_match_id = p_match_id
      and o.status = 'completed'
      and (
        (o.seeker_user_id = p_rater and o.provider_user_id = p_ratee)
        or (o.provider_user_id = p_rater and o.seeker_user_id = p_ratee)
      )
  );
$$;
revoke all on function public.completed_order_between(uuid, uuid, uuid) from public;
grant execute on function public.completed_order_between(uuid, uuid, uuid) to authenticated;

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
        and (
          (seeker.user_id = auth.uid() and provider.user_id = generic_ratings.ratee_user_id)
          or (provider.user_id = auth.uid() and seeker.user_id = generic_ratings.ratee_user_id)
        )
    )
    and (
      (
        exists (select 1 from public.generic_messages msg where msg.match_id = generic_ratings.match_id and msg.sender_id = auth.uid())
        and exists (select 1 from public.generic_messages msg where msg.match_id = generic_ratings.match_id and msg.sender_id = generic_ratings.ratee_user_id)
      )
      or public.completed_order_between(generic_ratings.match_id, auth.uid(), generic_ratings.ratee_user_id)
    )
  );
