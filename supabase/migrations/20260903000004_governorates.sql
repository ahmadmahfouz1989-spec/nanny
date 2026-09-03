-- Add the remaining 6 Lebanese governorates (Beirut and Mount Lebanon
-- were seeded in 20260821000003). Specific location is free text now, so
-- no districts/areas are seeded.

insert into public.locations (name_en, name_ar, name_fr, level, sort_order)
select v.name_en, v.name_ar, v.name_fr, 'governorate', v.sort_order
from (values
  ('North Lebanon', 'الشمال', 'Liban-Nord', 3),
  ('Akkar', 'عكار', 'Akkar', 4),
  ('Beqaa', 'البقاع', 'Bekaa', 5),
  ('Baalbek-Hermel', 'بعلبك الهرمل', 'Baalbek-Hermel', 6),
  ('South Lebanon', 'الجنوب', 'Liban-Sud', 7),
  ('Nabatieh', 'النبطية', 'Nabatieh', 8)
) as v(name_en, name_ar, name_fr, sort_order)
where not exists (
  select 1 from public.locations l
  where l.level = 'governorate' and l.name_en = v.name_en
);
