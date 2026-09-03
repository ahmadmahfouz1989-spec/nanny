-- Refined category list: nanny (live), nursing + tutoring (coming soon).
-- Replaces the broader placeholder set seeded in 20260903000001.

delete from public.categories where slug not in ('nanny', 'nursing', 'tutoring');

insert into public.categories (slug, name_en, name_ar, tagline_en, tagline_ar, icon, status, href, sort_order) values
  ('nanny', 'Nanny', 'مربية', 'Nannies and babysitters', 'مربيات وجليسات أطفال', 'heart', 'live', '/dashboard', 10),
  ('nursing', 'Nursing', 'التمريض', 'Home nurses and health aides', 'ممرضون منزليون ومساعدو رعاية صحية', 'hand', 'coming_soon', null, 20),
  ('tutoring', 'Tutoring', 'الدروس الخصوصية', 'Private lessons and coaching', 'دروس خصوصية وتدريب', 'book', 'coming_soon', null, 30)
on conflict (slug) do update set
  name_en = excluded.name_en,
  name_ar = excluded.name_ar,
  tagline_en = excluded.tagline_en,
  tagline_ar = excluded.tagline_ar,
  icon = excluded.icon,
  status = excluded.status,
  href = excluded.href,
  sort_order = excluded.sort_order;
