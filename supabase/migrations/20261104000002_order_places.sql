-- Exact pickup and drop-off places for Delivery & Errands orders, chosen on
-- Google Maps (current location, a search for a shop or address, or a pin
-- dropped anywhere). Pickup and drop-off are independent: neither has to
-- be where the customer is -- shop to home, shop to shop, person to
-- person, any place to any place.
--
-- The district (pickup_district_id / dropoff_district_id) stays: it's what
-- matching and the "area" a rider sees before confirming are based on.
-- From a map pin the server works it out (the nearest area).
--
-- Who sees what (lib/errand-order-view.ts): the customer and admins see
-- everything; a rider asked to quote sees the exact pickup but only the
-- drop-off's area; the rider who confirms sees both exact places, the
-- names, instructions and contact details.

alter table public.errand_orders
  add column pickup_lat double precision check (pickup_lat between -90 and 90),
  add column pickup_lng double precision check (pickup_lng between -180 and 180),
  add column pickup_address text check (char_length(pickup_address) <= 300),
  add column pickup_place_name text check (char_length(pickup_place_name) <= 160),
  add column pickup_instructions text check (char_length(pickup_instructions) <= 500),
  add column pickup_contact_name text check (char_length(pickup_contact_name) <= 80),
  add column pickup_contact_phone text check (char_length(pickup_contact_phone) <= 30),
  add column dropoff_lat double precision check (dropoff_lat between -90 and 90),
  add column dropoff_lng double precision check (dropoff_lng between -180 and 180),
  add column dropoff_address text check (char_length(dropoff_address) <= 300),
  add column dropoff_place_name text check (char_length(dropoff_place_name) <= 160),
  add column dropoff_instructions text check (char_length(dropoff_instructions) <= 500),
  add column dropoff_contact_name text check (char_length(dropoff_contact_name) <= 80),
  add column dropoff_contact_phone text check (char_length(dropoff_contact_phone) <= 30);

-- A point is both coordinates or neither.
alter table public.errand_orders
  add constraint errand_orders_pickup_point_check check ((pickup_lat is null) = (pickup_lng is null)),
  add constraint errand_orders_dropoff_point_check check ((dropoff_lat is null) = (dropoff_lng is null));
