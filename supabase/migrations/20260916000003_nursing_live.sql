-- Flips nursing from 'coming_soon' to 'live' once the category's
-- onboarding/dashboard/matching/messaging flow (this migration set plus the
-- app code alongside it) has been smoke-tested. Since CategoryGrid only
-- links a category when status = 'live' AND href is set, this single
-- update is what actually makes /categories/nursing/* reachable from the
-- hub -- everything shipped before it is inert until this runs.
--
-- Rollback is symmetric and safe: setting status back to 'coming_soon' and
-- href back to null instantly hides the category again with no data loss.

update public.categories
set status = 'live', href = '/categories/nursing/dashboard'
where slug = 'nursing';
