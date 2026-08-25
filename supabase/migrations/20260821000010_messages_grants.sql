-- Missed alongside the messages table itself — RLS policies alone don't
-- grant access; the underlying statement types need granting too (same
-- reasoning as 20260821000004_grants.sql for every other table).
grant select, insert, update on public.messages to authenticated;
