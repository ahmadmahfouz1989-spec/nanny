-- Flips tutoring from 'coming_soon' to 'live', same pattern as
-- 20260916000003_nursing_live.sql. CategoryGrid only links a category
-- when status = 'live' AND href is set, so this single update is what
-- actually makes /categories/tutoring/* reachable from the hub.
--
-- Apply this only after manually smoke-testing signup -> onboarding
-- (both seeker and provider) -> matching -> messaging -> admin moderation
-- against a real Supabase project. Rollback is symmetric and safe: set
-- status back to 'coming_soon' and href back to null to instantly hide it
-- again with no data loss.

update public.categories
set status = 'live', href = '/categories/tutoring/dashboard'
where slug = 'tutoring';
