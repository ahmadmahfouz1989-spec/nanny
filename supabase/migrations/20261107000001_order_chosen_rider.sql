-- A customer can send a delivery to one rider they choose instead of the
-- nearest available ones. The order then goes only to that rider; if they
-- pass or don't answer it ends as "no provider", and Try again sends a
-- copy (without the choice) to everyone as usual. See sendWave in
-- src/lib/errand-orders.ts.
alter table public.errand_orders
  add column if not exists chosen_provider_profile_id uuid references public.generic_profiles(id) on delete set null;
