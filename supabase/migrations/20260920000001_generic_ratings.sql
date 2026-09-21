-- Ratings for generic_matches (nursing, tutoring, and future categories) --
-- nanny/parent's `ratings` table stays untouched; this mirrors it exactly,
-- same pattern as generic_matches/generic_messages paralleling
-- matches/messages. Reuses set_updated_at() and protect_rating_mutation()
-- since both only reference column names that are identical across the
-- two tables.

create table public.generic_ratings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.generic_matches(id) on delete cascade,
  rater_user_id uuid not null references public.users(id) on delete cascade,
  ratee_user_id uuid not null references public.users(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, rater_user_id),
  constraint generic_ratings_no_self_rating check (rater_user_id <> ratee_user_id)
);

create index generic_ratings_ratee_idx on public.generic_ratings(ratee_user_id);

create trigger generic_ratings_set_updated_at
  before update on public.generic_ratings
  for each row execute function public.set_updated_at();

alter table public.generic_ratings enable row level security;

create policy generic_ratings_select on public.generic_ratings
  for select using (rater_user_id = auth.uid() or ratee_user_id = auth.uid());

-- Insert only your own rating, only for the counterpart of a mutual
-- generic_match you're a party to (mirrors ratings_insert, but both sides
-- are rows in the same generic_profiles table instead of two tables).
create policy generic_ratings_insert on public.generic_ratings
  for insert with check (
    rater_user_id = auth.uid()
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

create policy generic_ratings_update on public.generic_ratings
  for update using (rater_user_id = auth.uid()) with check (rater_user_id = auth.uid());

-- Same column-lock reasoning as ratings_protect_mutation -- reuses that
-- exact function since generic_ratings has the identical column set.
create trigger generic_ratings_protect_mutation
  before update on public.generic_ratings
  for each row execute function public.protect_rating_mutation();

grant select, insert, update on public.generic_ratings to authenticated;
grant select, insert, update, delete on public.generic_ratings to service_role;
