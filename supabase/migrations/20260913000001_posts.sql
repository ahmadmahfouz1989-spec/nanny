-- Timeline feed: short posts ("looking for" / "offering") that sit above
-- the structured match engine, for lower-friction visibility while a
-- user's real match pool is still thin. Connecting from a post still goes
-- through the existing matches table -- this only adds a public front door
-- to it, not a second safety model.

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  kind text not null check (kind in ('looking_for', 'offering')),
  location_id uuid references public.locations(id),
  days text[] not null default '{}',
  caption text not null check (char_length(caption) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'closed')),
  expires_at timestamptz not null default (now() + interval '21 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index posts_feed_idx on public.posts(created_at desc) where status = 'open';
create index posts_user_idx on public.posts(user_id);

create trigger posts_set_updated_at
  before update on public.posts
  for each row execute function public.set_updated_at();

-- user_id and kind are set once at creation from the poster's own role and
-- must never drift from it afterwards (kind flips who a post is even
-- visible to as "looking_for" vs "offering").
create or replace function public.protect_post_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.user_id <> old.user_id or new.kind <> old.kind then
    raise exception 'user_id and kind cannot be changed after a post is created';
  end if;
  return new;
end;
$$;

create trigger posts_protect_mutation
  before update on public.posts
  for each row execute function public.protect_post_mutation();

alter table public.posts enable row level security;

create policy posts_select on public.posts
  for select using (status = 'open' or user_id = auth.uid());

-- kind isn't client-chosen: a parent can only post "looking_for", a nanny
-- only "offering" -- mirrors how parent_profiles/nanny_profiles insert
-- policies already tie a row to the account's actual role.
create policy posts_insert on public.posts
  for insert with check (
    user_id = auth.uid()
    and (
      (kind = 'looking_for' and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'parent'))
      or (kind = 'offering' and exists (select 1 from public.users u where u.id = auth.uid() and u.role = 'nanny'))
    )
  );

create policy posts_update on public.posts
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy posts_delete on public.posts
  for delete using (user_id = auth.uid());

-- ─── likes ──────────────────────────────────────────────────────────────

create table public.post_likes (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index post_likes_post_idx on public.post_likes(post_id);

alter table public.post_likes enable row level security;

create policy post_likes_select on public.post_likes for select using (true);
create policy post_likes_insert on public.post_likes for insert with check (user_id = auth.uid());
create policy post_likes_delete on public.post_likes for delete using (user_id = auth.uid());

-- ─── replies ────────────────────────────────────────────────────────────
-- Public, so the same contact-info discipline that gates matches/messages
-- applies here too (enforced app-side at write time, same filter as the
-- post caption) -- a reply thread is exactly where that would erode first.

create table public.post_replies (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index post_replies_post_idx on public.post_replies(post_id, created_at);

alter table public.post_replies enable row level security;

create policy post_replies_select on public.post_replies
  for select using (
    exists (select 1 from public.posts p where p.id = post_id and (p.status = 'open' or p.user_id = auth.uid()))
  );

create policy post_replies_insert on public.post_replies
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.posts p where p.id = post_id and p.status = 'open')
  );

create policy post_replies_delete on public.post_replies for delete using (user_id = auth.uid());

-- ─── reports can now point at a post ───────────────────────────────────

alter table public.reports add column if not exists post_id uuid references public.posts(id) on delete set null;

-- ─── a reply is worth a notification; a like is not (noise) ────────────

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'new_match','interest_received','interest_accepted','profile_approved',
  'profile_rejected','verification_updated','report_resolved','profile_pending_review',
  'rating_received','post_reply'
));
