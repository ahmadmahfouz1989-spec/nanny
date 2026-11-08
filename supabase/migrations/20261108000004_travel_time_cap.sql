-- A daily cap on Google road-time lookups (billed per element: one rider
-- to one pickup), kept by ouiKnow itself whatever the Google quota says.
-- use_travel_time() books the elements only if the day (Beirut time) stays
-- within the cap; past it, dispatch falls back to straight-line distance.

alter table public.errand_settings
  add column if not exists travel_time_daily_limit integer not null default 500 check (travel_time_daily_limit between 0 and 100000);

create table if not exists public.travel_time_usage (
  day date primary key,
  elements integer not null default 0
);
alter table public.travel_time_usage enable row level security;
revoke all on public.travel_time_usage from anon, authenticated;
grant select, insert, update on public.travel_time_usage to service_role;

create or replace function public.use_travel_time(p_elements integer, p_limit integer)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Beirut')::date;
  booked integer;
begin
  if p_elements <= 0 or p_limit <= 0 then
    return false;
  end if;
  insert into public.travel_time_usage (day, elements) values (today, 0) on conflict (day) do nothing;
  update public.travel_time_usage
  set elements = elements + p_elements
  where day = today and elements + p_elements <= p_limit
  returning elements into booked;
  return booked is not null;
end;
$$;
revoke all on function public.use_travel_time(integer, integer) from public, anon, authenticated;
grant execute on function public.use_travel_time(integer, integer) to service_role;
