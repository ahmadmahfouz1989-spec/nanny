-- Flips home maintenance from 'coming_soon' to 'live', same pattern as
-- 20260918000001_tutoring_live.sql. CategoryGrid only links a category
-- when status = 'live' AND href is set, so this single update is what
-- makes /categories/maintenance/* reachable from the hub.
--
-- Rollback is symmetric and safe: set status back to 'coming_soon' and
-- href back to null to hide it again with no data loss.

update public.categories
set status = 'live', href = '/categories/maintenance/dashboard'
where slug = 'maintenance';
