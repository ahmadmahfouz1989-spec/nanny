-- Order numbers count completed orders: an order gets its number when it
-- is completed (1, 2, 3, ... in the order they were completed). Open,
-- in-progress, cancelled and unanswered orders have none.

alter table public.errand_orders alter column number drop identity if exists;
alter table public.errand_orders alter column number drop not null;

create sequence if not exists public.errand_order_number_seq as bigint;

-- Past orders: completed ones numbered by when they were completed, the rest cleared.
update public.errand_orders set number = null;
with done as (
  select id, row_number() over (order by status_changed_at, created_at) as n
  from public.errand_orders
  where status = 'completed'
)
update public.errand_orders o set number = done.n from done where o.id = done.id;

select setval(
  'public.errand_order_number_seq',
  coalesce((select max(number) from public.errand_orders), 0) + 1,
  false
);

create or replace function public.errand_orders_number_on_completion()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'completed' and new.number is null then
    new.number := nextval('public.errand_order_number_seq');
  end if;
  return new;
end;
$$;

drop trigger if exists errand_orders_number_on_completion on public.errand_orders;
create trigger errand_orders_number_on_completion
  before insert or update of status on public.errand_orders
  for each row execute function public.errand_orders_number_on_completion();
