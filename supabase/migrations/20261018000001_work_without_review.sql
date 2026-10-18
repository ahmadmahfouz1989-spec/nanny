-- Work projects go live without review: a project shows on the profile as
-- soon as it has a photo, and admins remove anything that breaks the
-- rules (the project is deleted). `status` stays, always 'approved', so
-- the visibility policy keeps working unchanged.
--
-- Safe in either order with the app code: the app already inserts
-- 'approved' explicitly. This releases anything still waiting and makes
-- the default match.

alter table public.work_projects alter column status set default 'approved';

update public.work_projects
set status = 'approved', reviewed_at = null
where status <> 'approved';
