-- "Get quotes" for Home Maintenance, on the same order tables as Delivery
-- & Errands. A customer describes a job once (trade, what's wrong, up to
-- three photos, where, when); it goes to the nearby tradespeople of that
-- trade, who answer with a price (or a range) and when they can come. The
-- customer picks one, the tradesperson confirms, and the job moves through
-- on the way → arrived → done → completed.
--
-- Differences from deliveries: no Available switch (a plumber doesn't sit
-- waiting for orders), several jobs at once, requests stay open for a day
-- by default (errand_settings.quote_open_minutes), and quotes carry a visit
-- time instead of minutes-away.

alter table public.errand_orders
  add column category text not null default 'errands' check (category in ('errands', 'maintenance'));

alter table public.errand_orders drop constraint errand_orders_service_check;
alter table public.errand_orders add constraint errand_orders_service_check check (
  (category = 'errands' and service in ('delivery', 'paperwork', 'queue', 'shopping', 'moto_taxi'))
  or (category = 'maintenance' and service in ('plumber', 'electrician', 'painter', 'tiler', 'carpenter'))
);

-- Photos of the job: object paths in the private order-photos bucket,
-- "<customer user id>/<random>.<ext>". Shown through short-lived links to
-- the customer, the tradespeople it was sent to, and admins.
alter table public.errand_orders
  add column photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 3);

create index errand_orders_category_idx on public.errand_orders(category, created_at desc);

-- Only a delivery rider is limited to one order at a time.
drop index public.errand_orders_one_active_per_provider;
create unique index errand_orders_one_active_per_provider on public.errand_orders(provider_profile_id)
  where category = 'errands' and status in ('accepted', 'on_the_way', 'arrived', 'picked_up');

-- A quote: "from $20" or "$20–30", and when they can come.
alter table public.errand_order_recipients
  add column price_max_usd numeric(10, 2) check (price_max_usd is null or (price_max_usd > 0 and price_max_usd <= 10000)),
  add column visit_at timestamptz;
alter table public.errand_order_recipients
  add constraint errand_order_recipients_price_range_check check (price_max_usd is null or price_max_usd >= price_usd);

alter table public.errand_settings
  add column quote_open_minutes integer not null default 1440 check (quote_open_minutes between 60 and 10080);

-- ─── photos ─────────────────────────────────────────────────────────────
-- Private, no client storage policies: the server uploads with the
-- service role (after checking the file) and hands out signed links.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('order-photos', 'order-photos', false, 8388608, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do nothing;
