-- Call history, missed-call counts, "Ringing…" and who takes calls.
--
-- calls.reached_at: the callee's app or phone got the call and is ringing
--   (the caller's screen moves from "Calling…" to "Ringing…").
-- calls.seen_at: the callee has looked at a call they missed (Calls tab or
--   the conversation), so it stops counting on the Messages badge.
-- users.accepts_calls: off = nobody can call this person in the app.
-- call_mutes: this person takes no calls in this one conversation.

alter table public.calls
  add column if not exists reached_at timestamptz,
  add column if not exists seen_at timestamptz;

-- Calls missed before this existed are old news: no badge for them.
update public.calls set seen_at = coalesce(ended_at, created_at) where seen_at is null and status in ('missed', 'busy');

create index if not exists calls_unseen_missed_idx
  on public.calls(callee_id)
  where seen_at is null and status in ('missed', 'busy');

-- The sweep that closes rings nobody ended (the caller's app died).
create index if not exists calls_ringing_idx on public.calls(created_at) where status = 'ringing';

alter table public.users
  add column if not exists accepts_calls boolean not null default true;

create table if not exists public.call_mutes (
  user_id uuid not null references public.users(id) on delete cascade,
  match_id uuid not null references public.generic_matches(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, match_id)
);

alter table public.call_mutes enable row level security;

-- Written only through /api (service role); each person can read their own.
drop policy if exists call_mutes_select on public.call_mutes;
create policy call_mutes_select on public.call_mutes
  for select using (auth.uid() = user_id);
