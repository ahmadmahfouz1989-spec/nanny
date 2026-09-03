-- Nationality on profiles, shown so each side knows the nationality of
-- people they're considering. Display only — not a match-score input.
-- Nullable: existing profiles predate the field. New values are validated
-- against the app's list (src/lib/validation/profile.ts), not a DB CHECK,
-- so the list can grow without a migration.

alter table public.parent_profiles add column if not exists nationality text;
alter table public.nanny_profiles add column if not exists nationality text;
