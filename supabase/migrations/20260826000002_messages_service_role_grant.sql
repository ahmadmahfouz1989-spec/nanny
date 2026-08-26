-- The original messages migration granted select/insert/update only to
-- authenticated, never to service_role. RLS bypass and table grants are
-- separate mechanisms — service_role bypasses RLS but still needs its own
-- grant to touch the table at all, which admin routes rely on (e.g.
-- reading a reported conversation's messages for moderation).
grant select, insert, update on public.messages to service_role;
