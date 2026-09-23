-- messageSummariesByMatch (src/lib/inbox.ts) fetched the newest 1000
-- messages across ALL of a user's matches combined, then took the first
-- (newest) row per match_id from that one shared list -- so once a single
-- busy conversation supplied all 1000 rows, every OTHER match's last
-- message got silently omitted, and the inbox rendered "no messages" for
-- conversations that actually have history. Pagination over a combined
-- list can't fix this; each match needs its own true latest row and
-- unread count, computed here directly rather than approximated app-side.
--
-- Two near-identical functions (not one parameterized by table name) since
-- the two message tables have independent RLS and this keeps both
-- statically analyzable rather than building dynamic SQL against a
-- caller-influenced table name.
create or replace function public.message_summaries_for_matches(p_match_ids uuid[], p_user_id uuid)
returns table (match_id uuid, last_body text, last_created_at timestamptz, unread_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select m.match_id, m.body as last_body, m.created_at as last_created_at, coalesce(u.unread_count, 0) as unread_count
  from (
    select distinct on (match_id) match_id, body, created_at
    from public.messages
    where match_id = any(p_match_ids)
    order by match_id, created_at desc
  ) m
  left join (
    select match_id, count(*) as unread_count
    from public.messages
    where match_id = any(p_match_ids) and sender_id <> p_user_id and read_at is null
    group by match_id
  ) u on u.match_id = m.match_id;
$$;

create or replace function public.generic_message_summaries_for_matches(p_match_ids uuid[], p_user_id uuid)
returns table (match_id uuid, last_body text, last_created_at timestamptz, unread_count bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select m.match_id, m.body as last_body, m.created_at as last_created_at, coalesce(u.unread_count, 0) as unread_count
  from (
    select distinct on (match_id) match_id, body, created_at
    from public.generic_messages
    where match_id = any(p_match_ids)
    order by match_id, created_at desc
  ) m
  left join (
    select match_id, count(*) as unread_count
    from public.generic_messages
    where match_id = any(p_match_ids) and sender_id <> p_user_id and read_at is null
    group by match_id
  ) u on u.match_id = m.match_id;
$$;

grant execute on function public.message_summaries_for_matches to authenticated;
grant execute on function public.generic_message_summaries_for_matches to authenticated;
