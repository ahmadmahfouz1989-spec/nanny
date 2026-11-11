-- ouiKnow Points & Referrals.
--
-- Points: one ledger, a row per gain or deduction, so a balance is always
-- the sum of its history. Activities and referrals are awarded by the
-- database itself, from the real events (an order completed, a phone
-- verified), never from something a client sends. Each award has a key
-- (rule + what it was for), so the same thing can never pay twice.
-- Point values, on/off and limits are rows in points_rules, changed from
-- the admin panel without a deploy.
--
-- Referrals: everyone has a code. Someone who signs up with it is the
-- inviter's referral; it counts (and pays) once their phone is verified
-- -- one phone number, one account -- and pays again on their first
-- request and their first completed service.

-- ─── release switch ────────────────────────────────────────────────────
-- Off until the team releases it from the admin panel: while off, nothing
-- is awarded and the app shows none of it (admins can still set it up).
create table public.points_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
insert into public.points_settings (id, enabled) values (true, false);

-- ─── rules ─────────────────────────────────────────────────────────────
create table public.points_rules (
  key text primary key,
  -- 'referral' rules pay the inviter (or, referral_welcome, the newcomer).
  kind text not null check (kind in ('activity', 'referral')),
  points int not null check (points between 0 and 100000),
  enabled boolean not null default true,
  -- Limits per person; null = no limit.
  max_total int check (max_total > 0),
  max_per_day int check (max_per_day > 0),
  max_per_month int check (max_per_month > 0),
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

insert into public.points_rules (key, kind, points, max_total, max_per_day, max_per_month, sort_order) values
  ('referral_signup',            'referral', 50, null, 10,   null, 10),
  ('referral_welcome',           'referral', 20, 1,    null, null, 20),
  ('referral_first_request',     'referral', 30, null, null, null, 30),
  ('referral_first_completed',   'referral', 70, null, null, null, 40),
  ('profile_complete',           'activity', 20, 1,    null, null, 100),
  ('request_placed',             'activity', 5,  null, 3,    20,   110),
  ('service_completed',          'activity', 30, null, 3,    null, 120),
  ('review_written',             'activity', 10, null, 3,    null, 130),
  ('provider_profile_approved',  'activity', 30, 8,    null, null, 200),
  ('work_photos_added',          'activity', 15, 8,    null, null, 210),
  ('offer_sent',                 'activity', 2,  null, 10,   null, 220),
  ('provider_reply',             'activity', 2,  null, 10,   null, 230),
  ('job_completed',              'activity', 30, null, 5,    null, 240),
  ('review_received',            'activity', 10, null, null, null, 250);

-- ─── ledger ────────────────────────────────────────────────────────────
create table public.points_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  points int not null check (points <> 0),
  -- activity / referral: from a rule; admin: added or taken by an admin
  -- (with a reason); redeem: spent (lucky draw entries, later).
  kind text not null check (kind in ('activity', 'referral', 'admin', 'redeem')),
  rule_key text references public.points_rules(key) on update cascade,
  -- What the award was for (an order id, a referred user's id...).
  ref text,
  note text check (char_length(note) <= 300),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint points_ledger_admin_reason check (kind <> 'admin' or char_length(coalesce(note, '')) >= 3)
);

-- The same rule never pays twice for the same thing.
create unique index points_ledger_once on public.points_ledger(user_id, rule_key, ref) where rule_key is not null and ref is not null;
create index points_ledger_user_idx on public.points_ledger(user_id, created_at desc);
create index points_ledger_rule_idx on public.points_ledger(rule_key, created_at desc);

-- ─── referral codes and referrals ──────────────────────────────────────
create table public.referral_codes (
  user_id uuid primary key references public.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6,10}$'),
  created_at timestamptz not null default now()
);

create table public.referrals (
  -- One inviter per person, ever.
  referred_user_id uuid primary key references public.users(id) on delete cascade,
  referrer_user_id uuid not null references public.users(id) on delete cascade,
  code text not null,
  -- How it arrived: a link opened on the web, a code typed, Google Play's install referrer.
  source text not null check (source in ('link', 'code', 'play_store')),
  status text not null default 'pending' check (status in ('pending', 'counted', 'rejected')),
  reject_reason text,
  created_at timestamptz not null default now(),
  counted_at timestamptz,
  constraint referrals_not_self check (referred_user_id <> referrer_user_id)
);
create index referrals_referrer_idx on public.referrals(referrer_user_id, created_at desc);

-- ─── access ────────────────────────────────────────────────────────────
-- People read their own points, code and referrals; everything is written
-- by the triggers below and the app's server (service role).
alter table public.points_settings enable row level security;
alter table public.points_rules enable row level security;
alter table public.points_ledger enable row level security;
alter table public.referral_codes enable row level security;
alter table public.referrals enable row level security;

create policy points_rules_read on public.points_rules for select to authenticated using (true);
create policy points_ledger_own on public.points_ledger for select to authenticated using (user_id = auth.uid());
create policy referral_codes_own on public.referral_codes for select to authenticated using (user_id = auth.uid());
create policy referrals_own on public.referrals for select to authenticated
  using (referrer_user_id = auth.uid() or referred_user_id = auth.uid());

grant select, update on public.points_settings to service_role;
grant select on public.points_rules, public.points_ledger, public.referral_codes, public.referrals to authenticated;
grant select, insert, update, delete on public.points_rules, public.points_ledger, public.referral_codes, public.referrals to service_role;

-- ─── awarding ──────────────────────────────────────────────────────────
-- Pays one rule to one person for one thing, if the rule is on, the
-- person isn't suspended and they're within the rule's limits. Returns
-- the points paid (0 when not). Never raises: points must not break the
-- action that earned them.
create or replace function public.award_points(p_user uuid, p_rule text, p_ref text, p_note text default null)
returns int
language plpgsql
security definer set search_path = public
as $$
declare
  r public.points_rules%rowtype;
  paid int;
begin
  if p_user is null then return 0; end if;
  -- Not released yet: nothing is earned.
  if not coalesce((select enabled from public.points_settings), false) then return 0; end if;
  select * into r from public.points_rules where key = p_rule;
  if not found or not r.enabled or r.points <= 0 then return 0; end if;
  if exists (select 1 from public.users where id = p_user and status = 'suspended') then return 0; end if;
  if r.max_total is not null
     and (select count(*) from public.points_ledger where user_id = p_user and rule_key = p_rule) >= r.max_total then
    return 0;
  end if;
  if r.max_per_day is not null
     and (select count(*) from public.points_ledger where user_id = p_user and rule_key = p_rule and created_at > now() - interval '1 day') >= r.max_per_day then
    return 0;
  end if;
  if r.max_per_month is not null
     and (select count(*) from public.points_ledger where user_id = p_user and rule_key = p_rule and created_at > now() - interval '30 days') >= r.max_per_month then
    return 0;
  end if;

  insert into public.points_ledger (user_id, points, kind, rule_key, ref, note)
  values (p_user, r.points, r.kind, p_rule, p_ref, p_note)
  on conflict do nothing
  returning points into paid;
  return coalesce(paid, 0);
exception when others then
  raise warning 'award_points(%, %, %): %', p_user, p_rule, p_ref, sqlerrm;
  return 0;
end;
$$;

-- Who invited this person, once the invite has counted.
create or replace function public.counted_referrer(p_user uuid)
returns uuid
language sql
stable
security definer set search_path = public
as $$
  select referrer_user_id from public.referrals where referred_user_id = p_user and status = 'counted';
$$;

-- A pending invite counts once the invited person's phone is verified:
-- the inviter is paid, and so is the newcomer.
create or replace function public.settle_referral(p_user uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  ref public.referrals%rowtype;
begin
  select * into ref from public.referrals where referred_user_id = p_user and status = 'pending';
  if not found then return; end if;
  if not exists (select 1 from public.users where id = p_user and phone_verified_at is not null) then return; end if;
  update public.referrals set status = 'counted', counted_at = now() where referred_user_id = p_user;
  perform public.award_points(ref.referrer_user_id, 'referral_signup', p_user::text);
  perform public.award_points(p_user, 'referral_welcome', 'welcome');
exception when others then
  raise warning 'settle_referral(%): %', p_user, sqlerrm;
end;
$$;

-- ─── triggers: where points come from ──────────────────────────────────

-- The account: phone verified (invites count), "About you" complete.
create or replace function public.points_on_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.phone_verified_at is not null and (tg_op = 'INSERT' or old.phone_verified_at is null) then
    perform public.settle_referral(new.id);
  end if;
  if coalesce(trim(new.full_name), '') <> '' and coalesce(trim(new.contact_phone), coalesce(new.phone, '')) <> '' and new.nationality is not null then
    perform public.award_points(new.id, 'profile_complete', 'account');
  end if;
  return new;
end;
$$;
create trigger users_points
  after insert or update of phone_verified_at, full_name, contact_phone, nationality on public.users
  for each row execute function public.points_on_user();

create or replace function public.points_on_referral()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  perform public.settle_referral(new.referred_user_id);
  return new;
end;
$$;
create trigger referrals_points
  after insert on public.referrals
  for each row execute function public.points_on_referral();

-- A request: an order or a repair quote request...
create or replace function public.points_on_order()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.award_points(new.seeker_user_id, 'request_placed', 'order:' || new.id);
    perform public.award_points(public.counted_referrer(new.seeker_user_id), 'referral_first_request', new.seeker_user_id::text);
  elsif new.status = 'completed' and old.status is distinct from 'completed' then
    -- Completed is the customer's confirmation, after delivery.
    perform public.award_points(new.seeker_user_id, 'service_completed', new.id::text);
    perform public.award_points(new.provider_user_id, 'job_completed', new.id::text);
    perform public.award_points(public.counted_referrer(new.seeker_user_id), 'referral_first_completed', new.seeker_user_id::text);
    perform public.award_points(public.counted_referrer(new.provider_user_id), 'referral_first_completed', new.provider_user_id::text);
  end if;
  return new;
end;
$$;
create trigger errand_orders_points
  after insert or update of status on public.errand_orders
  for each row execute function public.points_on_order();

-- ...or a request in a service (a nanny, a tutor...) going live; and a
-- provider profile approved.
create or replace function public.points_on_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.role = 'seeker' and new.status = 'active' and (tg_op = 'INSERT' or old.status is distinct from 'active') then
    perform public.award_points(new.user_id, 'request_placed', 'profile:' || new.id);
    perform public.award_points(public.counted_referrer(new.user_id), 'referral_first_request', new.user_id::text);
  end if;
  if new.role = 'provider' and new.moderation_status = 'approved' and (tg_op = 'INSERT' or old.moderation_status is distinct from 'approved') then
    perform public.award_points(new.user_id, 'provider_profile_approved', new.id::text);
  end if;
  return new;
end;
$$;
create trigger generic_profiles_points
  after insert or update of status, moderation_status on public.generic_profiles
  for each row execute function public.points_on_profile();

-- Photos of their work, once per profile.
create or replace function public.points_on_work_photo()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile uuid;
begin
  select profile_id into v_profile from public.work_projects where id = new.project_id;
  perform public.award_points(new.user_id, 'work_photos_added', v_profile::text);
  return new;
end;
$$;
create trigger work_photos_points
  after insert on public.work_photos
  for each row execute function public.points_on_work_photo();

-- A provider sending their price for a request.
create or replace function public.points_on_offer()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status = 'offered' and old.status is distinct from 'offered' then
    perform public.award_points(new.provider_user_id, 'offer_sent', new.id::text);
  end if;
  return new;
end;
$$;
create trigger errand_order_recipients_points
  after update of status on public.errand_order_recipients
  for each row execute function public.points_on_offer();

-- A provider answering someone who wrote to them (their first message in
-- a conversation the other side started).
create or replace function public.points_on_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_provider uuid;
begin
  select p.user_id into v_provider
  from public.generic_matches m join public.generic_profiles p on p.id = m.provider_profile_id
  where m.id = new.match_id;
  if v_provider is distinct from new.sender_id then return new; end if;
  if exists (select 1 from public.generic_messages where match_id = new.match_id and sender_id = new.sender_id and id <> new.id) then return new; end if;
  if not exists (select 1 from public.generic_messages where match_id = new.match_id and sender_id <> new.sender_id) then return new; end if;
  perform public.award_points(new.sender_id, 'provider_reply', new.match_id::text);
  return new;
end;
$$;
create trigger generic_messages_points
  after insert on public.generic_messages
  for each row execute function public.points_on_message();

-- A review, only when it follows a completed order between the two: the
-- writer is paid, and the provider who received it.
create or replace function public.points_on_rating()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_provider uuid;
begin
  if not public.completed_order_between(new.match_id, new.rater_user_id, new.ratee_user_id) then return new; end if;
  perform public.award_points(new.rater_user_id, 'review_written', new.match_id::text);
  select p.user_id into v_provider
  from public.generic_matches m join public.generic_profiles p on p.id = m.provider_profile_id
  where m.id = new.match_id;
  if v_provider = new.ratee_user_id then
    perform public.award_points(new.ratee_user_id, 'review_received', new.match_id::text);
  end if;
  return new;
end;
$$;
create trigger generic_ratings_points
  after insert on public.generic_ratings
  for each row execute function public.points_on_rating();

-- None of these are for callers: only the triggers and the server use them.
revoke all on function public.award_points(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.counted_referrer(uuid) from public, anon, authenticated;
revoke all on function public.settle_referral(uuid) from public, anon, authenticated;
grant execute on function public.award_points(uuid, text, text, text) to service_role;
grant execute on function public.settle_referral(uuid) to service_role;
