-- Post-match ratings: once a match is mutual, each party may leave the
-- other a 1–5 star rating with an optional comment. One rating per rater
-- per match, editable afterwards. Gated exactly like messaging — a mutual
-- match is the prerequisite.

create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  rater_user_id uuid not null references public.users(id) on delete cascade,
  ratee_user_id uuid not null references public.users(id) on delete cascade,
  score smallint not null check (score between 1 and 5),
  comment text check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (match_id, rater_user_id),
  constraint ratings_no_self_rating check (rater_user_id <> ratee_user_id)
);

create index ratings_ratee_idx on public.ratings(ratee_user_id);

create trigger ratings_set_updated_at
  before update on public.ratings
  for each row execute function public.set_updated_at();

alter table public.ratings enable row level security;

-- A user sees only ratings they wrote or received. The aggregate score
-- shown on other people's match cards is computed server-side with the
-- service role (same pattern as the contact-details route).
create policy ratings_select on public.ratings
  for select using (rater_user_id = auth.uid() or ratee_user_id = auth.uid());

-- Insert only your own rating, only for the counterpart of a mutual match
-- you're a party to (mirrors messages_insert).
create policy ratings_insert on public.ratings
  for insert with check (
    rater_user_id = auth.uid()
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

create policy ratings_update on public.ratings
  for update using (rater_user_id = auth.uid()) with check (rater_user_id = auth.uid());

-- RLS gates rows, not columns — lock everything except score/comment so an
-- edit can't re-point the rating at a different match or person (same
-- reasoning as protect_message_mutation).
create or replace function public.protect_rating_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id or new.match_id <> old.match_id
     or new.rater_user_id <> old.rater_user_id or new.ratee_user_id <> old.ratee_user_id
     or new.created_at <> old.created_at then
    raise exception 'only score and comment may be updated on a rating';
  end if;
  return new;
end;
$$;

create trigger ratings_protect_mutation
  before update on public.ratings
  for each row execute function public.protect_rating_mutation();

-- Table-level grants (see 20260821000004_grants.sql) — service_role needs
-- its own grant even though it bypasses RLS, and 20260821000004 only
-- covered tables that existed then.
grant select, insert, update on public.ratings to authenticated;
grant select, insert, update, delete on public.ratings to service_role;

-- Notify the ratee when a rating lands (or is updated).
alter table public.notifications drop constraint notifications_type_check;

alter table public.notifications add constraint notifications_type_check check (type in (
  'new_match','interest_received','interest_accepted','profile_approved',
  'profile_rejected','verification_updated','report_resolved','profile_pending_review',
  'rating_received'
));
