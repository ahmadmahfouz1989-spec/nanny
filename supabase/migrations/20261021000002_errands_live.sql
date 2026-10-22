-- Flips delivery & errands from 'coming_soon' to 'live', same pattern as
-- 20261004000002_maintenance_live.sql. Rollback: status back to
-- 'coming_soon' and href back to null hides it again with no data loss.

update public.categories
set status = 'live', href = '/categories/errands/dashboard'
where slug = 'errands';
