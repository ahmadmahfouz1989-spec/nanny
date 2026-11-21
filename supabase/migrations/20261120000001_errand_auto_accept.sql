-- "Take the first rider within my budget": the first delivery offer at or
-- under the order's budget is accepted straight away, with no choosing.
alter table public.errand_orders
  add column if not exists auto_accept boolean not null default false;
