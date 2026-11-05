-- Announcements from ouiKnow to providers. One row per message, one row per
-- recipient: the primary key is what makes a second copy to the same person
-- impossible, and those rows are the admin's delivery log and each
-- provider's inbox. Written only by the server (service role).

create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  -- Sent by the admin's browser: pressing Send twice is still one message.
  request_id uuid not null unique,
  created_by uuid references public.users(id) on delete set null,
  title text not null check (char_length(title) between 2 and 80),
  body text not null check (char_length(body) between 2 and 2000),
  audience text not null check (audience in ('all_providers', 'category', 'selected')),
  category_id uuid references public.categories(id),
  status text not null default 'sending' check (status in ('sending', 'finished')),
  created_at timestamptz not null default now(),
  finished_at timestamptz,
  check ((audience = 'category') = (category_id is not null))
);

create index broadcasts_created_idx on public.broadcasts(created_at desc);

-- push_status:
--   pending    waiting its turn
--   sending    being sent now
--   sent       Apple, Google or the browser accepted it for at least one device
--   no_device  notifications aren't on anywhere; the inbox still has it
--   failed     no device accepted it; "Send again" retries only these
create table public.broadcast_recipients (
  broadcast_id uuid not null references public.broadcasts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  push_status text not null default 'pending' check (push_status in ('pending', 'sending', 'sent', 'no_device', 'failed')),
  devices_sent integer not null default 0,
  devices_failed integer not null default 0,
  attempted_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (broadcast_id, user_id)
);

create index broadcast_recipients_inbox_idx on public.broadcast_recipients(user_id, created_at desc);
create index broadcast_recipients_status_idx on public.broadcast_recipients(broadcast_id, push_status);

alter table public.broadcasts enable row level security;
alter table public.broadcast_recipients enable row level security;

-- A provider reads only what was sent to them.
create policy broadcast_recipients_select_own on public.broadcast_recipients
  for select to authenticated
  using (user_id = auth.uid());

create policy broadcasts_select_received on public.broadcasts
  for select to authenticated
  using (exists (
    select 1 from public.broadcast_recipients r
    where r.broadcast_id = broadcasts.id and r.user_id = auth.uid()
  ));

-- Supabase's default privileges hand every new table to anon and
-- authenticated, which would make the column grants below mean nothing.
revoke all on public.broadcasts from anon, authenticated;
revoke all on public.broadcast_recipients from anon, authenticated;

-- Not who sent it, or the audience: only what the provider needs to read.
grant select (id, title, body, created_at) on public.broadcasts to authenticated;
grant select (broadcast_id, user_id, read_at, created_at) on public.broadcast_recipients to authenticated;
grant select, insert, update, delete on public.broadcasts to service_role;
grant select, insert, update, delete on public.broadcast_recipients to service_role;

-- ─── notifications ──────────────────────────────────────────────────────
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (type in (
  'new_match','interest_received','interest_accepted','profile_approved',
  'profile_rejected','verification_updated','report_resolved','profile_pending_review',
  'rating_received','post_reply','post_like',
  'work_approved','work_rejected','work_pending_review',
  'errand_request','errand_offer','errand_selected','errand_confirmed',
  'errand_status','errand_cancelled','errand_no_provider',
  'announcement'
));
