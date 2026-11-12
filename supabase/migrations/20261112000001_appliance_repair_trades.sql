-- Home maintenance gains appliance repair: fridges, washing machines and
-- air conditioners (src/lib/validation/maintenance.ts TRADES). Quote
-- requests name one of them as their service.

alter table public.errand_orders drop constraint errand_orders_service_check;
alter table public.errand_orders add constraint errand_orders_service_check check (
  (category = 'errands' and service in ('delivery', 'paperwork', 'queue', 'shopping', 'moto_taxi'))
  or (category = 'maintenance' and service in ('plumber', 'electrician', 'painter', 'tiler', 'carpenter', 'fridge', 'washing_machine', 'air_conditioning'))
);

update public.categories
set tagline_en = 'Plumbers, electricians, painters, tilers, carpenters and appliance repair',
    tagline_ar = 'سبّاك، كهربجي، دهّان، بلّاط، نجّار، تصليح براد وغسالة ومكيفات'
where slug = 'maintenance';
