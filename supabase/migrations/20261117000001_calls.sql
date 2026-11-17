-- In-app voice calls between the two people in a conversation.
--
-- The audio goes peer to peer (WebRTC); this table only records each call
-- so the other side can be rung (realtime + push), and so a missed call
-- can be told apart from an answered one. Rows are written only through
-- /api/calls (service role); the two parties can read their own calls,
-- which is what lets the callee's realtime subscription see one arrive.

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.generic_matches(id) on delete cascade,
  caller_id uuid not null references public.users(id) on delete cascade,
  callee_id uuid not null references public.users(id) on delete cascade,
  status text not null default 'ringing' check (status in ('ringing', 'active', 'ended', 'missed', 'declined', 'busy', 'failed')),
  created_at timestamptz not null default now(),
  answered_at timestamptz,
  ended_at timestamptz,
  check (caller_id <> callee_id)
);

create index calls_callee_idx on public.calls(callee_id, created_at desc);
create index calls_caller_idx on public.calls(caller_id, created_at desc);
create index calls_match_idx on public.calls(match_id, created_at desc);

alter table public.calls enable row level security;

create policy calls_select on public.calls
  for select using (auth.uid() = caller_id or auth.uid() = callee_id);

alter publication supabase_realtime add table public.calls;
