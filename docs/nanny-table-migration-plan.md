# Plan: move nanny onto the shared category tables

Status: **proposal, not started.** Nothing here has been applied.

## Goal

Make nanny an ordinary category on the same tables nursing and tutoring use
(`generic_profiles`, `generic_matches`, `generic_messages`, `generic_ratings`),
then retire nanny's own tables. After this, every category runs through one
code path end to end.

What users see should not change: same profiles, matches, chat history,
ratings, saved profiles, feed posts, and links.

## Scope (measured 2026-09-25)

| Area | What refers to nanny's tables |
|---|---|
| App code | 41 files in `src/` |
| Migrations | 28 files; ~150 functions, policies and triggers in them |
| Tables to retire | `parent_profiles`, `nanny_profiles`, `parent_profile_languages`, `nanny_profile_languages`, `nanny_experience`, `matches`, `messages`, `ratings` |
| Tables pointing at them | `favorites` (saved profiles), `posts` (`posted_as_*_profile_id`), `reports` (`match_id` + `match_source`), `notifications` (`payload.match_id`) |
| Database functions to retire | `create_/update_parent_profile`, `create_/update_nanny_profile`, `is_parent_/is_nanny_profile_mutual_counterpart`, `message_summaries_for_matches`, `protect_matches_mutation`, `protect_message_mutation` |
| `users.role` | 33 checks for `"parent"`/`"nanny"` in app code |

## Key decisions

1. **Keep every ID.** Copy each nanny profile, match, message and rating into
   the shared tables with its existing UUID. Links, notifications, reports,
   saved profiles, feed attributions and voice-note paths all keep working
   without rewriting references. (UUIDs are random, so a clash with an
   existing nursing/tutoring row is effectively impossible, but the migration
   checks for one and aborts if found.)
2. **Map the two sides:** parent → `seeker`, nanny → `provider`. Statuses map
   the same way (`parent_interested` → `seeker_interested`,
   `declined_by_nanny` → `declined_by_provider`, `initiated_by` likewise).
3. **Typed columns become `attributes`.** Same keys the app already uses in
   camelCase:
   - *Nanny (provider):* `workRadiusKm`, `employmentType`,
     `liveArrangementPref`, `availability`, `yearsExperience`,
     `expectedSalaryMin/Max`, `hasTransportation`, `canDrive`,
     `certifications`, `shortIntro`, `locationDetail`, `nationality`,
     `languageIds` (from `nanny_profile_languages`), `experience`
     (`[{ageGroup, yearsExperience}]` from `nanny_experience`).
   - *Parent (seeker):* `numChildren`, `childrenAgeRanges`, `scheduleType`,
     `liveArrangement`, `desiredStartDate`, `salaryMin/Max`,
     `transportationRequired`, `additionalDuties`, `familyDescription`,
     `neededDays`, `locationDetail`, `nationality`, `languageIds`.
   - `profile_completion_pct` is dropped (nothing reads it).
4. **Keep the scoring rules exactly.** `engine.ts` stays as nanny's scoring
   rubric; only its input changes. A small adapter reads the same fields
   out of `attributes`. The engine is registered like `tutoring-engine.ts`.
5. **Photos stay where they are.** Existing files remain in `nanny-photos` and
   `parent-photos`; new uploads go to `generic-photos`. The
   `protect_generic_profile_photo` trigger and the storage-cleanup code
   accept the caller's own folder in any of the three buckets.
6. **Cut over during a short maintenance window, not with dual writes.**
   Writing to both old and new tables at once would double the risky code
   for a user base this size. Instead: put the app in read-only mode for a
   few minutes, copy, deploy, reopen.

## Phases

### Phase 0: before touching data (prerequisites)
- **Automated tests for the match flows:** interest → mutual → chat → rate,
  decline, expiry, contact reveal, suspension blocking. Run them before and
  after, so "nothing changed for users" is checked, not assumed.
- **A staging copy of production** (a Supabase branch, or a restore of a
  recent backup into a separate project) to rehearse the whole cutover at
  least once.
- **A read-only switch:** an env flag the proxy/API honors, returning 503
  on writes, so the cutover window is safe.

### Phase 1: build the new path (no production impact)
- Add a `nanny` entry to `CATEGORY_SCHEMAS` (`/api/generic-profile`), with
  validation matching today's `nannyProfileSchema`/`parentProfileSchema`,
  including the "active nanny must have a photo" rule that is currently a
  table constraint.
- Point the nanny onboarding wizards at `/api/generic-profile` (keep the UI).
- Nanny engine adapter + `generic-recompute` support for the nanny rubric.
- Port `/api/search/nannies` and `/api/search/families` filters to
  `attributes`, or fold them into `/api/generic-matches`.
- Remove the `"nanny"` source from `match-access.ts`; the inbox, saved
  profiles, feed identities, admin, reports and featured code read only
  the shared tables.
- Route `/dashboard`, `/matches` and `/onboarding` to
  `/categories/nanny/...`, with redirects for old links and email links.
- Stop requiring `users.role` for nanny; keep the column only for `admin`.
- All of this ships behind the cutover, so it's written and tested on
  staging only.

### Phase 2: data migration (one SQL migration, rehearsed on staging)
Runs in one transaction:
1. Insert `categories`-linked `generic_profiles` rows from `parent_profiles`
   and `nanny_profiles` (same IDs, joined languages/experience folded into
   `attributes`).
2. Insert `generic_matches` from `matches` (status/side mapping, same IDs,
   `category_id` = nanny's).
3. Insert `generic_messages` from `messages` (same IDs, `audio_path`
   unchanged, `read_at` kept).
4. Insert `generic_ratings` from `ratings`.
5. Backfill `favorites.generic_profile_id`, `posts.posted_as_generic_profile_id`.
6. Rewrite `notifications.payload`: `match_id` → `generic_match_id` plus
   `category_slug: 'nanny'`.
7. Rewrite `reports`: `match_source 'nanny'` stays (it's already a slug);
   profile-type fields → `generic`.
8. Row-count checks: every source count must equal its copy's count, or
   the transaction aborts.

### Phase 3: cutover (production, ~15 minutes)
1. Turn on read-only mode.
2. Apply the Phase 2 migration.
3. Deploy the Phase 1 code.
4. Checks: row counts, recompute scores for a sample of nanny profiles and
   compare with the old `matches.score` (must match), open a few real
   conversations (history, voice notes, unread counts), check ratings
   aren't double counted, check saved profiles and feed authors.
5. Turn off read-only mode.

### Phase 4: retire the old tables (2–4 weeks later)
- Drop the old tables, their functions, policies and triggers, and the
  nanny-only code paths.
- Until this step, rollback is possible.

## Rollback

- **During Phase 3, before read-only is lifted:** revert the deploy and
  delete the copied rows (they're identifiable by nanny's `category_id`). Old
  tables were never modified.
- **After reopening, before Phase 4:** reverting the deploy works, but nanny
  activity since cutover (new messages, matches, profile edits) exists only
  in the shared tables. It needs a reverse-copy script, which should be
  written and tested on staging as part of Phase 0.
- **After Phase 4:** restore from backup only.

## Risks to watch

- **Ratings counted twice:** `ratings.ts` currently merges `ratings` and
  `generic_ratings`. The code that stops reading `ratings` must ship in the
  same window as the copy.
- **Realtime:** chat subscriptions move from `messages` to
  `generic_messages`; anyone with a thread open during cutover needs a
  reload. That's acceptable inside the window.
- **Scoring drift:** any mismatch in the attribute mapping changes match
  scores silently. That's what the score comparison in Phase 3 is for.
- **Moderation state:** keep `moderation_status` exactly as is; saving
  through the new path must not re-queue every nanny profile for review.

## Effort

Roughly **1.5–3 weeks** of focused work: Phase 0 about 3–5 days (tests +
staging + read-only flag), Phase 1 about 5–8 days, Phase 2 + rehearsal about
2–3 days, cutover and Phase 4 about 1 day each.

## Decisions (2026-09-25)

1. **Read-only window:** a ~15-minute window at a quiet hour is acceptable.
2. **Rehearsal database:** a separate Supabase project restored from a dump
   of production (see "Setting up the rehearsal copy" below).
3. **Old nanny URLs:** `/dashboard`, `/matches` and `/onboarding` redirect
   permanently to `/categories/nanny/...`, so bookmarks and old emails
   keep working. Nanny keeps no separate top-level routes.

## Setting up the rehearsal copy

Supabase branches start empty (migrations + seed only), so they can't
rehearse a data migration. Use a separate project instead:

1. Create a new Supabase project (e.g. `ouiknow-staging`), same region.
2. Install the tools: `brew install supabase/tap/supabase libpq`.
3. From each project's dashboard (Connect → Session pooler), copy the
   Postgres connection string. Then dump production:
   ```
   supabase db dump --db-url "$PROD_DB_URL" -f roles.sql --role-only
   supabase db dump --db-url "$PROD_DB_URL" -f schema.sql
   supabase db dump --db-url "$PROD_DB_URL" -f data.sql --use-copy --data-only
   ```
4. Load it into staging:
   ```
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql --file schema.sql \
     --command 'SET session_replication_role = replica' \
     --file data.sql --dbname "$STAGING_DB_URL"
   ```
5. Storage files (photos, voice notes) are not copied. Photo URLs still
   point at production's public buckets, so photos render. Voice notes
   won't play on staging, which doesn't matter for this rehearsal.
6. **Before running the app against staging:** leave its email settings
   empty (no Resend/SMTP keys), so a rehearsal can never email real users.

This copy holds real users' emails, phone numbers and messages. Keep the
project private, keep the dump files out of the repo, and delete both after
the cutover.
