-- Matches/messages for generic_profiles-based categories (nursing first).
-- Mirrors matches/messages exactly, but keyed through generic_profiles
-- instead of parent_profiles/nanny_profiles, and scoped by category_id so
-- future categories share these two tables instead of getting their own.
-- The live nanny matches/messages tables and their RLS are untouched.

create table public.generic_matches (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id),
  seeker_profile_id uuid not null references public.generic_profiles(id) on delete cascade,
  provider_profile_id uuid not null references public.generic_profiles(id) on delete cascade,
  score numeric(5,2) not null check (score between 0 and 100),
  score_breakdown jsonb not null,
  status text not null default 'suggested' check (status in (
    'suggested','seeker_interested','provider_interested','mutual',
    'declined_by_seeker','declined_by_provider','expired'
  )),
  initiated_by text check (initiated_by in ('seeker','provider')),
  interest_expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint generic_matches_distinct_profiles check (seeker_profile_id <> provider_profile_id),
  unique (seeker_profile_id, provider_profile_id)
);

create trigger generic_matches_set_updated_at
  before update on public.generic_matches
  for each row execute function public.set_updated_at();

create index generic_matches_seeker_idx on public.generic_matches(seeker_profile_id);
create index generic_matches_provider_idx on public.generic_matches(provider_profile_id);
create index generic_matches_score_idx on public.generic_matches(score desc);

-- A plain CHECK can't look at other tables, so validate that both sides
-- belong to this match's category and hold the expected role via a trigger.
create or replace function public.validate_generic_match_profiles()
returns trigger
language plpgsql
as $$
declare
  v_seeker public.generic_profiles;
  v_provider public.generic_profiles;
begin
  select * into v_seeker from public.generic_profiles where id = new.seeker_profile_id;
  select * into v_provider from public.generic_profiles where id = new.provider_profile_id;

  if v_seeker.role <> 'seeker' or v_provider.role <> 'provider' then
    raise exception 'generic_matches requires a seeker profile and a provider profile';
  end if;
  if v_seeker.category_id <> new.category_id or v_provider.category_id <> new.category_id then
    raise exception 'both profiles must belong to the match''s category';
  end if;
  return new;
end;
$$;

create trigger generic_matches_validate_profiles
  before insert or update of category_id, seeker_profile_id, provider_profile_id on public.generic_matches
  for each row execute function public.validate_generic_match_profiles();

alter table public.generic_matches enable row level security;

create policy generic_matches_select on public.generic_matches
  for select using (
    exists (select 1 from public.generic_profiles gp where gp.id = seeker_profile_id and gp.user_id = auth.uid())
    or exists (select 1 from public.generic_profiles gp where gp.id = provider_profile_id and gp.user_id = auth.uid())
  );

-- Only the interest state-machine (via the service-role client in
-- src/lib/matching/generic-*.ts) ever updates a match row directly -- same
-- posture as protect_matches_mutation would be for the nanny table, so lock
-- every column to service_role only for writes.
create policy generic_matches_service_write on public.generic_matches
  for all to service_role using (true) with check (true);

grant select on public.generic_matches to authenticated;
grant select, insert, update, delete on public.generic_matches to service_role;

-- ─── generic_messages ───────────────────────────────────────────────────

create table public.generic_messages (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.generic_matches(id) on delete cascade,
  sender_id uuid not null references public.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index generic_messages_match_idx on public.generic_messages(match_id, created_at);

alter table public.generic_messages enable row level security;

create policy generic_messages_select on public.generic_messages
  for select using (
    exists (
      select 1 from public.generic_matches gm
      join public.generic_profiles seeker on seeker.id = gm.seeker_profile_id
      join public.generic_profiles provider on provider.id = gm.provider_profile_id
      where gm.id = generic_messages.match_id
        and gm.status = 'mutual'
        and (seeker.user_id = auth.uid() or provider.user_id = auth.uid())
    )
  );

create policy generic_messages_insert on public.generic_messages
  for insert with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.generic_matches gm
      join public.generic_profiles seeker on seeker.id = gm.seeker_profile_id
      join public.generic_profiles provider on provider.id = gm.provider_profile_id
      where gm.id = generic_messages.match_id
        and gm.status = 'mutual'
        and (seeker.user_id = auth.uid() or provider.user_id = auth.uid())
    )
  );

create policy generic_messages_mark_read on public.generic_messages
  for update using (
    sender_id <> auth.uid()
    and exists (
      select 1 from public.generic_matches gm
      join public.generic_profiles seeker on seeker.id = gm.seeker_profile_id
      join public.generic_profiles provider on provider.id = gm.provider_profile_id
      where gm.id = generic_messages.match_id
        and gm.status = 'mutual'
        and (seeker.user_id = auth.uid() or provider.user_id = auth.uid())
    )
  )
  with check (sender_id <> auth.uid());

create or replace function public.protect_generic_message_mutation()
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

create trigger generic_messages_protect_mutation
  before update on public.generic_messages
  for each row execute function public.protect_generic_message_mutation();

grant select, insert, update on public.generic_messages to authenticated;
grant select, insert, update on public.generic_messages to service_role;

alter publication supabase_realtime add table public.generic_messages;
