-- Flash news: a line of news an admin posts for everyone. It scrolls in
-- a banner at the top of the app (like a news ticker) until an admin takes
-- it down; the admin can also push it to everyone's phone once.
-- Written only through /api/admin/flash-news (service role); everyone,
-- visitors included, can read the live ones.

create table if not exists public.flash_news (
  id uuid primary key default gen_random_uuid(),
  body text not null check (char_length(body) between 2 and 300),
  -- The Arabic version, shown in the Arabic app (falls back to body).
  body_ar text check (body_ar is null or char_length(body_ar) between 2 and 300),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  -- Taken down: the banner goes.
  ended_at timestamptz,
  -- Pushed to phones (once), and how many devices took it.
  pushed_at timestamptz,
  push_sent integer,
  push_failed integer
);

create index if not exists flash_news_live_idx on public.flash_news(created_at desc) where ended_at is null;

alter table public.flash_news enable row level security;

drop policy if exists flash_news_read_live on public.flash_news;
create policy flash_news_read_live on public.flash_news
  for select to anon, authenticated using (ended_at is null);
