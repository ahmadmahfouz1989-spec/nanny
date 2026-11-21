-- Delivery & Errands first in every list of services (home, browse, menus).
update public.categories set sort_order = 5 where slug = 'errands';
