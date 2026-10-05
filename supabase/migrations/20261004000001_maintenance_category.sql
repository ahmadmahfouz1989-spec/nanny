-- Home maintenance (plumbers, electricians, painters, tilers, carpenters):
-- one category with the trade picked inside it, built on the shared
-- generic_profiles / generic_matches path like nursing and tutoring.
--
-- Added as 'coming_soon' so it stays hidden while the code that serves it
-- deploys. A separate migration flips it to 'live' afterwards (same
-- pattern as 20260918000001_tutoring_live.sql).

insert into public.categories (slug, name_en, name_ar, tagline_en, tagline_ar, icon, status, href, sort_order) values
  (
    'maintenance',
    'Home Maintenance',
    'صيانة المنزل',
    'Plumbers, electricians, painters, tilers and carpenters',
    'سبّاك، كهربجي، دهّان، بلّاط، نجّار',
    'wrench',
    'coming_soon',
    null,
    40
  )
on conflict (slug) do nothing;
