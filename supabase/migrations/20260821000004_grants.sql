-- Table-level GRANTs. Postgres requires these in addition to RLS policies —
-- RLS narrows which rows a statement can touch, but the statement type
-- (SELECT/INSERT/UPDATE/DELETE) must be granted on the table first.
-- service_role bypasses RLS (rolbypassrls) but still needs the underlying
-- grant to issue statements at all.

grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on all tables in schema public to service_role;

grant select on public.locations, public.languages to anon, authenticated;

grant select, update on public.users to authenticated;

grant select, insert, update on public.parent_profiles to authenticated;
grant select, insert, update, delete on public.parent_profile_languages to authenticated;

grant select, insert, update on public.nanny_profiles to authenticated;
grant select, insert, update, delete on public.nanny_profile_languages to authenticated;
grant select, insert, update, delete on public.nanny_experience to authenticated;

grant select, update on public.matches to authenticated;

grant select, insert, update, delete on public."references" to authenticated;

grant select, insert on public.verification to authenticated;

grant select, insert on public.reports to authenticated;

grant select, insert, update, delete on public.blocks to authenticated;

grant select, insert, update, delete on public.favorites to authenticated;

grant select, update on public.notifications to authenticated;
