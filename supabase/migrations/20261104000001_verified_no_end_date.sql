-- "Featured" is now shown as Verified (a blue check, and first in lists).
-- An admin can verify someone with no end date, not only for the 30 days
-- or year that are paid for: record those grants as 'permanent'.

alter table public.featured_grants drop constraint subscription_grants_plan_check;
alter table public.featured_grants add constraint featured_grants_plan_check
  check (plan in ('monthly', 'yearly', 'permanent'));
