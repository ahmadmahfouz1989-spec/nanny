-- Delivery & errands (delivery & pickup, paperwork, queue & waiting,
-- shopping, moto taxi): one category with the service picked inside it,
-- built on the shared generic_profiles / generic_matches path like home
-- maintenance.
--
-- Added as 'coming_soon' so it stays hidden while the code that serves it
-- deploys. 20261021000002_errands_live.sql flips it to 'live' afterwards
-- (same pattern as 20261004000001/2 for maintenance).

insert into public.categories (slug, name_en, name_ar, tagline_en, tagline_ar, icon, status, href, sort_order) values
  (
    'errands',
    'Delivery & Errands',
    'توصيل ومشاوير',
    'Delivery, paperwork, queues, shopping and moto taxi',
    'توصيل، معاملات، انتظار بالدور، مشتريات وموتو',
    'scooter',
    'coming_soon',
    null,
    50
  )
on conflict (slug) do nothing;
