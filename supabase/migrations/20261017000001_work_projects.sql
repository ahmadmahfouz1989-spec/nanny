-- Work on profiles: a provider shows what they've done as projects (a
-- title, a description and 1-10 photos with captions), shown on their
-- profile page. Each project stays hidden from everyone but its owner
-- until an admin approves it; editing one sends it back to review.
-- Plus a one-line headline under the name on the profile page.
--
-- Additive only, so it can be applied before the app code that uses it.

-- ─── headline ──────────────────────────────────────────────────────────

alter table public.generic_profiles
  add column headline text check (char_length(headline) between 1 and 80);

-- ─── projects and photos ───────────────────────────────────────────────

create table public.work_projects (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.generic_profiles(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  title text not null check (char_length(title) between 2 and 80),
  description text check (char_length(description) <= 1000),
  position int not null default 0,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index work_projects_profile_idx on public.work_projects(profile_id, position);
create index work_projects_pending_idx on public.work_projects(created_at) where status = 'pending';

create trigger work_projects_set_updated_at
  before update on public.work_projects
  for each row execute function public.set_updated_at();

create table public.work_photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.work_projects(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  -- Object path in the generic-photos bucket, always under
  -- `${user_id}/work/` (the upload route builds it; nothing else writes).
  path text not null,
  url text not null,
  caption text check (char_length(caption) <= 140),
  width int,
  height int,
  position int not null default 0,
  created_at timestamptz not null default now()
);

create index work_photos_project_idx on public.work_photos(project_id, position);

-- ─── who can see them ──────────────────────────────────────────────────
-- Reads go through RLS: the owner sees all of their own; anyone else sees
-- an approved project only on a profile they can already see (the nested
-- generic_profiles read applies that table's own policy, which never
-- reads back into these tables, so there's no recursion).
--
-- No insert/update/delete policies: every write goes through the
-- /api/work-projects routes with the service role after their own checks
-- (owner, active account, provider profile, limits), so a client can never
-- approve its own project or point a photo at someone else's file.

alter table public.work_projects enable row level security;
alter table public.work_photos enable row level security;

create policy work_projects_select on public.work_projects
  for select using (
    user_id = auth.uid()
    or (
      status = 'approved'
      and exists (select 1 from public.generic_profiles p where p.id = work_projects.profile_id)
    )
  );

create policy work_photos_select on public.work_photos
  for select using (
    exists (select 1 from public.work_projects w where w.id = work_photos.project_id)
  );

grant select on public.work_projects to authenticated;
grant select on public.work_photos to authenticated;
grant select, insert, update, delete on public.work_projects to service_role;
grant select, insert, update, delete on public.work_photos to service_role;

-- ─── notifications ─────────────────────────────────────────────────────

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'new_match','interest_received','interest_accepted','profile_approved',
  'profile_rejected','verification_updated','report_resolved','profile_pending_review',
  'rating_received','post_reply','post_like',
  'work_approved','work_rejected','work_pending_review'
));
