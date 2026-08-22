-- Seed geography and languages (spec: docs/product-spec.md §7 example hierarchy)

with gov as (
  insert into public.locations (name_en, name_ar, name_fr, level, sort_order) values
    ('Beirut', 'بيروت', 'Beyrouth', 'governorate', 1),
    ('Mount Lebanon', 'جبل لبنان', 'Mont-Liban', 'governorate', 2)
  returning id, name_en
),
dist as (
  insert into public.locations (name_en, name_ar, name_fr, level, parent_location_id, sort_order)
  select d.name_en, d.name_ar, d.name_fr, 'district', gov.id, d.sort_order
  from (values
    ('Beirut', 'بيروت', 'Beyrouth', 'Beirut', 1),
    ('Metn', 'المتن', 'Metn', 'Mount Lebanon', 1),
    ('Baabda', 'بعبدا', 'Baabda', 'Mount Lebanon', 2),
    ('Keserwan', 'كسروان', 'Kesrouane', 'Mount Lebanon', 3)
  ) as d(name_en, name_ar, name_fr, gov_name, sort_order)
  join gov on gov.name_en = d.gov_name
  returning id, name_en
)
insert into public.locations (name_en, name_ar, name_fr, level, parent_location_id, sort_order)
select a.name_en, a.name_ar, a.name_fr, 'area', dist.id, a.sort_order
from (values
  ('Achrafieh', 'الأشرفية', 'Achrafieh', 'Beirut', 1),
  ('Hamra', 'الحمرا', 'Hamra', 'Beirut', 2),
  ('Verdun', 'فردان', 'Verdun', 'Beirut', 3),
  ('Antelias', 'انطلياس', 'Antélias', 'Metn', 1),
  ('Jal el Dib', 'جل الديب', 'Jal el Dib', 'Metn', 2),
  ('Zalka', 'الزلقا', 'Zalka', 'Metn', 3),
  ('Broummana', 'برمانا', 'Broummana', 'Metn', 4),
  ('Hazmieh', 'الحازمية', 'Hazmieh', 'Baabda', 1),
  ('Baabda', 'بعبدا', 'Baabda', 'Baabda', 2),
  ('Hadath', 'الحدث', 'Hadath', 'Baabda', 3),
  ('Jounieh', 'جونيه', 'Jounieh', 'Keserwan', 1),
  ('Kaslik', 'الكسليك', 'Kaslik', 'Keserwan', 2),
  ('Zouk', 'ذوق مكايل', 'Zouk', 'Keserwan', 3)
) as a(name_en, name_ar, name_fr, dist_name, sort_order)
join dist on dist.name_en = a.dist_name;

insert into public.languages (code, name_en, name_ar, name_fr) values
  ('en', 'English', 'الإنجليزية', 'Anglais'),
  ('ar', 'Arabic', 'العربية', 'Arabe'),
  ('fr', 'French', 'الفرنسية', 'Français'),
  ('tl', 'Tagalog', 'التاغالوغية', 'Tagalog'),
  ('am', 'Amharic', 'الأمهرية', 'Amharique');
