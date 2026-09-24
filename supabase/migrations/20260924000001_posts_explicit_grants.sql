-- The feed tables (20260913000001_posts.sql) were created without explicit
-- grants and have only worked via Supabase's implicit default privileges on
-- public. From 2026-10-30 new tables no longer get those, so a fresh project,
-- preview branch or `supabase db reset` would leave the feed unreachable.
-- The blanket service_role grant in 20260821000004_grants.sql also predates
-- these tables, so it doesn't cover them. Privileges mirror the RLS policies
-- each table actually defines; grants are idempotent, so this is a no-op on
-- databases that already have them.

grant select, insert, update, delete on public.posts to authenticated;
grant select, insert, delete on public.post_likes to authenticated;
grant select, insert, delete on public.post_replies to authenticated;

grant select, insert, update, delete on public.posts to service_role;
grant select, insert, update, delete on public.post_likes to service_role;
grant select, insert, update, delete on public.post_replies to service_role;
