-- Profile growth: work shared to the feed, profile view counts, and the
-- response-time / conversations figures on profile pages.
--
-- Additive only, so it can be applied before the app code that uses it.

-- ─── work in the feed ──────────────────────────────────────────────────
-- A provider can share a work project as a feed post. The post links to
-- the project, whose photos the feed shows -- but only to viewers who can
-- see the project (its own RLS), so sharing never widens who sees work.
-- Removing the project (owner or admin) removes the post with it.

alter table public.posts
  add column work_project_id uuid references public.work_projects(id) on delete cascade;

-- One post per project.
create unique index posts_work_project_idx on public.posts(work_project_id) where work_project_id is not null;

-- A post can only point at its author's own project, and never change
-- which project it points at.
create or replace function public.protect_post_work_project()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and new.work_project_id is distinct from old.work_project_id then
    raise exception 'work_project_id cannot change';
  end if;
  if tg_op = 'INSERT' and new.work_project_id is not null and not exists (
    select 1 from public.work_projects w where w.id = new.work_project_id and w.user_id = new.user_id
  ) then
    raise exception 'work_project_id must be one of your own work projects';
  end if;
  return new;
end;
$$;

create trigger posts_protect_work_project
  before insert or update on public.posts
  for each row execute function public.protect_post_work_project();

-- ─── profile views ─────────────────────────────────────────────────────
-- One row per viewer per profile per day, so refreshing doesn't inflate
-- the count. Owners only ever see a number -- never who: there are no
-- client policies at all; the server records and counts with the service
-- role.

create table public.profile_views (
  profile_id uuid not null references public.generic_profiles(id) on delete cascade,
  viewer_id uuid not null references public.users(id) on delete cascade,
  day date not null default current_date,
  primary key (profile_id, viewer_id, day)
);

create index profile_views_recent_idx on public.profile_views(profile_id, day);

alter table public.profile_views enable row level security;
grant select, insert, delete on public.profile_views to service_role;

-- ─── response time and conversations ───────────────────────────────────
-- For a profile's last 90 days of conversations: how many people it has
-- talked with (both sides wrote), and its median time to reply when the
-- other side wrote last. Server only (service role) -- the page shows them
-- once there's enough to be meaningful.

create or replace function public.profile_activity_stats(p_profile_id uuid)
returns table (conversations bigint, replies bigint, median_reply_minutes numeric)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select user_id from public.generic_profiles where id = p_profile_id
  ),
  my_matches as (
    select gm.id from public.generic_matches gm
    where gm.seeker_profile_id = p_profile_id or gm.provider_profile_id = p_profile_id
  ),
  msgs as (
    select m.match_id, m.sender_id, m.created_at,
           lag(m.sender_id) over (partition by m.match_id order by m.created_at) as prev_sender,
           lag(m.created_at) over (partition by m.match_id order by m.created_at) as prev_at
    from public.generic_messages m
    where m.match_id in (select id from my_matches)
      and m.created_at > now() - interval '90 days'
  ),
  talked as (
    select match_id from msgs
    group by match_id
    having bool_or(sender_id = (select user_id from me)) and bool_or(sender_id <> (select user_id from me))
  ),
  reply_times as (
    select extract(epoch from (created_at - prev_at)) / 60 as minutes
    from msgs
    where sender_id = (select user_id from me)
      and prev_sender is not null
      and prev_sender <> sender_id
  )
  select
    (select count(*) from talked),
    (select count(*) from reply_times),
    (select percentile_cont(0.5) within group (order by minutes) from reply_times)::numeric;
$$;

revoke all on function public.profile_activity_stats(uuid) from public, anon, authenticated;
grant execute on function public.profile_activity_stats(uuid) to service_role;
