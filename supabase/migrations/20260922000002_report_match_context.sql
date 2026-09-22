-- Reports only ever recorded reporter/reported user ids, leaving the
-- admin review endpoint to guess which conversation is being reported by
-- searching for a mutual match between the two of them -- ambiguous (or
-- outright wrong) once the same two people have more than one active
-- service relationship (e.g. a nanny match AND a nursing match at once).
-- match_source mirrors the existing convention used elsewhere in the app
-- (InboxConversation.source): "nanny" for the legacy matches table, a
-- category slug for a generic_matches row. No FK on match_id since it's
-- polymorphic across two tables depending on match_source.
alter table public.reports add column if not exists match_id uuid;
alter table public.reports add column if not exists match_source text;
