-- In-app messaging, gated the same way contact info is: only once a match
-- is mutual. One thread per match (matches.id is the thread id).

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index messages_match_idx on public.messages(match_id, created_at);

alter table public.messages enable row level security;

create policy messages_select on public.messages
  for select using (
    exists (
      select 1 from public.matches m
      join public.parent_profiles pp on pp.id = m.parent_profile_id
      join public.nanny_profiles np on np.id = m.nanny_profile_id
      where m.id = messages.match_id
        and m.status = 'mutual'
        and (pp.user_id = auth.uid() or np.user_id = auth.uid())
    )
  );

create policy messages_insert on public.messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.matches m
      join public.parent_profiles pp on pp.id = m.parent_profile_id
      join public.nanny_profiles np on np.id = m.nanny_profile_id
      where m.id = messages.match_id
        and m.status = 'mutual'
        and (pp.user_id = auth.uid() or np.user_id = auth.uid())
    )
  );

-- Only the recipient can mark a message read, and only their own inbound
-- messages (never the sender's own, and never anything else on the row).
create policy messages_mark_read on public.messages
  for update using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.matches m
      join public.parent_profiles pp on pp.id = m.parent_profile_id
      join public.nanny_profiles np on np.id = m.nanny_profile_id
      where m.id = messages.match_id
        and m.status = 'mutual'
        and (pp.user_id = auth.uid() or np.user_id = auth.uid())
    )
  )
  with check (sender_id <> auth.uid());

-- RLS restricts which rows can be updated, not which columns — a recipient
-- with UPDATE access to mark a message read could otherwise also rewrite
-- its body. Locks every column except read_at.
create or replace function public.protect_message_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.id <> old.id or new.match_id <> old.match_id or new.sender_id <> old.sender_id
     or new.body <> old.body or new.created_at <> old.created_at then
    raise exception 'only read_at may be updated on a message';
  end if;
  return new;
end;
$$;

create trigger messages_protect_mutation
  before update on public.messages
  for each row execute function public.protect_message_mutation();

alter publication supabase_realtime add table public.messages;
