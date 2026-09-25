# Nanny → shared category tables: cutover runbook

Status: **built and rehearsed locally, not yet run in production.** The code
is on branch `nanny-unification`; `main` does not have it yet.

## What changes

Nanny becomes an ordinary category on the tables nursing and tutoring use
(`generic_profiles`, `generic_matches`, `generic_messages`,
`generic_ratings`). Every nanny/parent profile, match, message and rating
is copied with its existing id (parent → seeker, nanny → provider), so
links, notifications, reports, saved profiles, feed attributions and
voice-note paths stay valid. Nanny's scoring rules are unchanged; they read
the same fields from `attributes`.

Old nanny URLs (`/matches`, `/onboarding`) redirect permanently to
`/categories/nanny/...`; `/dashboard` becomes the home page that opens
the account's only category, or the category hub if it has several.

The legacy tables are left in place, untouched, until the clean-up step.

## Pieces

| File | Purpose |
|---|---|
| `supabase/migrations/20260926000001_nanny_to_generic.sql` | The data migration. One transaction; aborts on any count mismatch. |
| `supabase/tests/nanny-migration-rollback.sql` | Undo, valid until read-only mode is lifted. |
| `scripts/check-nanny-score-parity.ts` | Scores every parent × nanny pair from both copies; fails on any difference. |
| `supabase/tests/nanny-migration-fixture.sql`, `…-checks.sql` | Local rehearsal data and assertions (local database only). |
| `READ_ONLY_MODE=1` (already on `main`) | Makes every `/api` write return 503 while pages keep working. |

## Rehearsed locally (2026-09-25)

Against a fresh local Supabase with all migrations and a fixture covering
every nanny data shape: migration and all checks passed; score parity
passed; a migrated parent and nanny could sign in, see matches, chat
(history kept, new messages land in the shared table), rate, and edit
their profile; a brand-new account completed nanny onboarding; an admin
approved it and nanny matches were scored with nanny's rules; rollback
restored the original state.

## Decisions

1. **Window:** about 30 minutes at a quiet hour, read-only throughout, with
   every check done *before* reopening. That keeps rollback simple: nothing
   new has been written to the shared tables yet.
2. **No staging copy of production.** The local rehearsal plus a
   dry run on production (below) cover the same risks without copying
   users' personal data.
3. **Old URLs redirect** to the category pages.

## Days before

1. **Dry run on production.** In the Supabase SQL editor, run
   `begin;` + the migration file + `rollback;`. It must finish without
   error. This exercises the real data, then undoes everything.

## Cutover (≈30 min)

1. **Railway:** set `READ_ONLY_MODE=1` on the service. Wait for the
   redeploy, then confirm that sending a message fails with the maintenance
   notice.
2. **Supabase SQL editor:** run `begin;` + the migration file + `commit;`.
3. **Score parity** from a local shell (service-role key from Supabase →
   Settings → API):
   `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/check-nanny-score-parity.ts`
   It must print "Score parity OK".
4. **Deploy the code:** merge `nanny-unification` into `main` and push.
   `READ_ONLY_MODE` stays set, so the new code comes up read-only.
5. **Check, still read-only:**
   - sign in as a parent and as a nanny: matches, a conversation's
     history, Saved, profile page;
   - a match's rating count isn't doubled;
   - admin: profile queue and reports load.
6. **Reopen:** remove `READ_ONLY_MODE`, wait for the redeploy, send one
   test message.

## If the migration ran before the code deploy (what happened 2026-09-25)

`supabase db push` applied the migration while production was still on the
old code, outside read-only mode. The copy itself is correct, but until
the new code is live the old code keeps writing nanny activity to the
legacy tables (not copied), sees both copies (ratings counted twice,
duplicate conversations), and its admin queue could re-score nanny copies
with the wrong rubric. To finish:

1. **Railway:** set `READ_ONLY_MODE=1` and wait for the redeploy.
2. **SQL editor:** `begin;` + `supabase/tests/nanny-migration-catch-up.sql`
   + `commit;` -- copies everything the old code wrote since the migration
   (whichever copy changed last wins; safe to run twice).
3. **Scores:** run the parity script with `--fix`, then once more without
   it; it must print both "OK" lines.
4. Continue at step 4 of the cutover (merge + push, check, reopen).

The rollback script below no longer applies once the old code has written
to the shared tables for nanny -- fix forward.

## Rollback (any time before step 6)

1. Revert `main` to the commit before the merge and push.
2. SQL editor: `begin;` + `supabase/tests/nanny-migration-rollback.sql` +
   `commit;`.
3. Remove `READ_ONLY_MODE`.

After step 6, new nanny activity exists only in the shared tables, so fix
forward instead of rolling back.

## Clean-up (2–4 weeks later)

A follow-up migration drops `parent_profiles`, `nanny_profiles`, their
language/experience tables, `matches`, `messages`, `ratings`, the legacy
`favorites`/`posts` columns and nanny-only functions and policies, and
clears the old `parent`/`nanny` values from `users.role`. Only then does
the rollback script stop working.
