-- Umbrella marketplace: the site connects people offering and seeking
-- services/jobs across categories. Childcare (the original nanny app) is
-- the first live category; the rest are placeholders until built out.
--
-- The childcare category keeps its dedicated parent_profiles /
-- nanny_profiles tables. Future categories use the generic profile table
-- below (attributes as jsonb, matching driven off a per-category config).

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name_en text not null,
  name_ar text not null,
  tagline_en text not null default '',
  tagline_ar text not null default '',
  icon text not null default 'sparkle',
  status text not null default 'coming_soon' check (status in ('live', 'coming_soon')),
  -- Route a live category points at (childcare currently reuses /dashboard).
  href text,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.categories enable row level security;

create policy categories_select_all on public.categories for select using (true);

grant select on public.categories to anon, authenticated;
grant select, insert, update, delete on public.categories to service_role;

insert into public.categories (slug, name_en, name_ar, tagline_en, tagline_ar, icon, status, href, sort_order) values
  ('childcare', 'Childcare', 'رعاية الأطفال', 'Nannies and babysitters', 'مربيات وجليسات أطفال', 'heart', 'live', '/dashboard', 10),
  ('cleaning', 'Cleaning', 'التنظيف', 'Home and office cleaning', 'تنظيف المنازل والمكاتب', 'spray', 'coming_soon', null, 20),
  ('tutoring', 'Tutoring', 'الدروس الخصوصية', 'Private lessons and coaching', 'دروس خصوصية وتدريب', 'book', 'coming_soon', null, 30),
  ('elderly_care', 'Elderly care', 'رعاية المسنين', 'Companions and caregivers', 'مرافقون ومقدمو رعاية', 'hand', 'coming_soon', null, 40),
  ('home_repairs', 'Home repairs', 'إصلاحات المنزل', 'Plumbing, electrical, handywork', 'سباكة وكهرباء وأعمال يدوية', 'wrench', 'coming_soon', null, 50),
  ('pet_care', 'Pet care', 'رعاية الحيوانات', 'Walking, sitting, grooming', 'تمشية ومجالسة وعناية', 'paw', 'coming_soon', null, 60);

-- ─── generic per-category profiles (shell — unused until a 2nd category) ──

create table public.generic_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  category_id uuid not null references public.categories(id),
  role text not null check (role in ('seeker', 'provider')),
  full_name text not null check (char_length(full_name) between 2 and 80),
  location_id uuid references public.locations(id),
  attributes jsonb not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'active', 'paused')),
  moderation_status text not null default 'pending' check (moderation_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, role)
);

create index generic_profiles_category_idx on public.generic_profiles(category_id, role);

create trigger generic_profiles_set_updated_at
  before update on public.generic_profiles
  for each row execute function public.set_updated_at();

alter table public.generic_profiles enable row level security;

create policy generic_profiles_select on public.generic_profiles
  for select using (
    user_id = auth.uid()
    or (status = 'active' and moderation_status = 'approved')
  );

create policy generic_profiles_write_own on public.generic_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.generic_profiles to authenticated;
grant select, insert, update, delete on public.generic_profiles to service_role;
