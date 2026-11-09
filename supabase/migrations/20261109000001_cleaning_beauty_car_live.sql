-- Cleaning, Beauty & Wellness and Car Services go live. Their forms,
-- matching and pages shipped hidden (Oct 30 / Nov 1); a category appears
-- everywhere (Home, Services, search, Welcome) once its row is here and
-- live. Re-running is harmless: an existing row is set live.

insert into public.categories (slug, name_en, name_ar, tagline_en, tagline_ar, icon, status, href, sort_order) values
  (
    'cleaning',
    'Cleaning',
    'تنظيف',
    'Home cleaning, sofas and carpets, water tanks, hourly helpers',
    'تنظيف بيوت، كنبايات وسجاد، خزانات مي، مساعدة بالساعة',
    'spray',
    'live',
    '/categories/cleaning/dashboard',
    60
  ),
  (
    'beauty',
    'Beauty & Wellness',
    'تجميل وعناية',
    'Hair, nails, makeup, skin care, massage and bridal',
    'شعر، أظافر، مكياج، عناية بالبشرة، مساج وعرايس',
    'lotus',
    'live',
    '/categories/beauty/dashboard',
    70
  ),
  (
    'car',
    'Car Services',
    'خدمات السيارات',
    'Mechanics, batteries, tires, towing, car wash and inspection',
    'ميكانيك، بطاريات، دواليب، سحب، غسيل سيارات وفحص',
    'car',
    'live',
    '/categories/car/dashboard',
    80
  )
on conflict (slug) do update set status = 'live', href = excluded.href;
