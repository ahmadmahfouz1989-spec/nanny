-- Lebanon Nanny/Parent Matching Platform — core schema (spec: docs/product-spec.md §3)

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ─── users ──────────────────────────────────────────────────────────────

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('parent','nanny','admin')),
  email text unique,
  phone text unique,
  email_verified_at timestamptz,
  phone_verified_at timestamptz,
  preferred_language text not null default 'en' check (preferred_language in ('en','ar','fr')),
  status text not null default 'active' check (status in ('active','suspended','deleted')),
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_identifier_present check (email is not null or phone is not null)
);

create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ─── reference data: locations, languages ──────────────────────────────

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_ar text not null,
  name_fr text not null,
  level text not null check (level in ('governorate','district','area')),
  parent_location_id uuid references public.locations(id),
  sort_order int not null default 0,
  constraint locations_parent_required_unless_governorate
    check (level = 'governorate' or parent_location_id is not null)
);

create index locations_parent_idx on public.locations(parent_location_id);

create table public.languages (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_en text not null,
  name_ar text not null,
  name_fr text not null
);

-- ─── parent_profiles ────────────────────────────────────────────────────

create table public.parent_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  location_id uuid not null references public.locations(id),
  num_children smallint not null check (num_children between 1 and 10),
  children_age_ranges text[] not null,
  schedule_type text not null check (schedule_type in ('full_time','part_time','either')),
  live_arrangement text not null check (live_arrangement in ('live_in','live_out','either')),
  desired_start_date date not null,
  salary_min integer not null check (salary_min >= 0),
  salary_max integer not null,
  transportation_required boolean not null default false,
  additional_duties text[] not null default '{}',
  family_description text check (char_length(family_description) <= 1000),
  status text not null default 'draft' check (status in ('draft','active','paused')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected')),
  profile_completion_pct int not null default 0 check (profile_completion_pct between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint parent_profiles_salary_range check (salary_max >= salary_min),
  constraint parent_profiles_age_ranges_present check (array_length(children_age_ranges, 1) >= 1),
  constraint parent_profiles_age_ranges_valid check (
    children_age_ranges <@ array['newborn','infant','toddler','preschool','school_age','teen']::text[]
  )
);

create trigger parent_profiles_set_updated_at
  before update on public.parent_profiles
  for each row execute function public.set_updated_at();

create table public.parent_profile_languages (
  parent_profile_id uuid not null references public.parent_profiles(id) on delete cascade,
  language_id uuid not null references public.languages(id),
  primary key (parent_profile_id, language_id)
);

-- ─── nanny_profiles ─────────────────────────────────────────────────────

create table public.nanny_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 80),
  profile_photo_url text,
  location_id uuid not null references public.locations(id),
  work_radius_km smallint not null check (work_radius_km between 1 and 50),
  employment_type text not null check (employment_type in ('full_time','part_time','either')),
  live_arrangement_pref text not null check (live_arrangement_pref in ('live_in','live_out','either')),
  availability jsonb not null,
  years_experience numeric(4,1) not null check (years_experience >= 0),
  expected_salary_min integer not null check (expected_salary_min >= 0),
  expected_salary_max integer not null,
  has_transportation boolean not null default false,
  can_drive boolean not null default false,
  certifications text[] not null default '{}',
  short_intro text check (char_length(short_intro) <= 500),
  status text not null default 'draft' check (status in ('draft','active','paused')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending','approved','rejected')),
  profile_completion_pct int not null default 0 check (profile_completion_pct between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint nanny_profiles_salary_range check (expected_salary_max >= expected_salary_min),
  constraint nanny_profiles_active_requires_photo check (status = 'draft' or profile_photo_url is not null)
);

create trigger nanny_profiles_set_updated_at
  before update on public.nanny_profiles
  for each row execute function public.set_updated_at();

create table public.nanny_profile_languages (
  nanny_profile_id uuid not null references public.nanny_profiles(id) on delete cascade,
  language_id uuid not null references public.languages(id),
  primary key (nanny_profile_id, language_id)
);

create table public.nanny_experience (
  id uuid primary key default gen_random_uuid(),
  nanny_profile_id uuid not null references public.nanny_profiles(id) on delete cascade,
  age_group text not null check (age_group in ('newborn','infant','toddler','preschool','school_age','teen')),
  years_experience numeric(4,1) not null check (years_experience >= 0),
  unique (nanny_profile_id, age_group)
);

-- validate that profile location_id points at an 'area'-level location
create or replace function public.validate_area_location()
returns trigger
language plpgsql
as $$
begin
  if not exists (select 1 from public.locations where id = new.location_id and level = 'area') then
    raise exception 'location_id must reference a location with level = area';
  end if;
  return new;
end;
$$;

create trigger parent_profiles_validate_location
  before insert or update of location_id on public.parent_profiles
  for each row execute function public.validate_area_location();

create trigger nanny_profiles_validate_location
  before insert or update of location_id on public.nanny_profiles
  for each row execute function public.validate_area_location();

-- ─── matches ────────────────────────────────────────────────────────────

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  parent_profile_id uuid not null references public.parent_profiles(id) on delete cascade,
  nanny_profile_id uuid not null references public.nanny_profiles(id) on delete cascade,
  score numeric(5,2) not null check (score between 0 and 100),
  score_breakdown jsonb not null,
  status text not null default 'suggested' check (status in (
    'suggested','parent_interested','nanny_interested','mutual',
    'declined_by_parent','declined_by_nanny','expired'
  )),
  initiated_by text check (initiated_by in ('parent','nanny')),
  interest_expires_at timestamptz,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (parent_profile_id, nanny_profile_id)
);

create trigger matches_set_updated_at
  before update on public.matches
  for each row execute function public.set_updated_at();

create index matches_parent_idx on public.matches(parent_profile_id);
create index matches_nanny_idx on public.matches(nanny_profile_id);
create index matches_score_idx on public.matches(score desc);

-- ─── trust & safety ─────────────────────────────────────────────────────

create table public."references" (
  id uuid primary key default gen_random_uuid(),
  nanny_profile_id uuid not null references public.nanny_profiles(id) on delete cascade,
  reference_name text not null,
  relationship text not null,
  contact_phone text,
  contact_email text,
  verified_at timestamptz,
  verified_by_admin_id uuid references public.users(id),
  created_at timestamptz not null default now()
);

create table public.verification (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in ('phone','email','identity','reference')),
  status text not null default 'pending' check (status in ('pending','verified','rejected')),
  document_ref text,
  verified_by_admin_id uuid references public.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid not null references public.users(id),
  reported_user_id uuid not null references public.users(id),
  reason text not null check (reason in ('inappropriate_content','harassment','fraud_scam','fake_profile','other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  resolved_by_admin_id uuid references public.users(id),
  resolved_at timestamptz,
  resolution_notes text,
  created_at timestamptz not null default now()
);

create table public.blocks (
  blocker_user_id uuid not null references public.users(id) on delete cascade,
  blocked_user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_user_id, blocked_user_id),
  constraint blocks_no_self_block check (blocker_user_id <> blocked_user_id)
);

-- ─── favorites, notifications ───────────────────────────────────────────

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  favorited_profile_id uuid not null,
  profile_type text not null check (profile_type in ('parent','nanny')),
  created_at timestamptz not null default now(),
  unique (user_id, favorited_profile_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null check (type in (
    'new_match','interest_received','interest_accepted','profile_approved',
    'profile_rejected','verification_updated','report_resolved'
  )),
  payload jsonb not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications(user_id, created_at desc);
