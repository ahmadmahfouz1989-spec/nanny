-- Live rider on the map during a delivery: where the assigned rider's
-- phone is (exact, every ~15 s while their order page is open), shown only
-- to that order's customer, through the app's API. Private: no policies,
-- so only the server reads or writes it. Gone as soon as the order is no
-- longer in progress (delivered, completed, cancelled, dropped).

create table if not exists public.errand_order_tracking (
  order_id uuid primary key references public.errand_orders(id) on delete cascade,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m double precision,
  located_at timestamptz not null default now()
);
alter table public.errand_order_tracking enable row level security;
revoke all on public.errand_order_tracking from anon, authenticated;
grant select, insert, update, delete on public.errand_order_tracking to service_role;

create or replace function public.stop_order_tracking()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if new.status not in ('accepted', 'on_the_way', 'arrived', 'picked_up') or new.provider_user_id is distinct from old.provider_user_id then
    delete from public.errand_order_tracking where order_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists errand_orders_stop_tracking on public.errand_orders;
create trigger errand_orders_stop_tracking
  after update of status, provider_user_id on public.errand_orders
  for each row execute function public.stop_order_tracking();
