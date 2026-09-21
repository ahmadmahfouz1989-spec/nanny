-- Voice notes for generic_messages (nursing, tutoring, and future
-- categories) -- mirrors 20260914000001_voice_notes.sql's columns exactly.
-- The `voice-notes` storage bucket and its RLS policies are reused as-is:
-- they're keyed by "first path segment is your own user id", nothing
-- about them is specific to the legacy `messages` table.

alter table public.generic_messages add column audio_path text;
alter table public.generic_messages add column audio_duration_seconds smallint;
