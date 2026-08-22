# Lebanon Nanny / Parent Matching Platform

MVP for a Lebanon-focused two-sided marketplace connecting parents with nannies. Product spec: [`docs/product-spec.md`](docs/product-spec.md).

Stack: Next.js (App Router) + TypeScript + Tailwind CSS, Supabase (Postgres, Auth, Storage), a TypeScript weighted-rules matching engine (no AI).

## Status

R1–R6 are in place: full schema + RLS policies (`supabase/migrations`), signup/login/verification/recovery flows, session middleware, parent/nanny onboarding wizards, the weighted-rules matching engine (`src/lib/matching/`), search/browse (`/matches`, `src/app/api/search/`), the interest/accept/decline workflow with contact unlock (`src/app/api/matches/[id]/`), and admin moderation (`/admin`, `src/app/api/admin/`) — profile approval/rejection, user suspension (actually enforced: suspended users are signed out and blocked at both login and the session middleware), and a reports queue fed by a report button on match cards. Beta (controlled launch) is what's left — see `docs/product-spec.md` §14 for the roadmap.

### Creating an admin account

Signup can't self-provision an admin (by design — the `handle_new_user` trigger coerces any non-parent/nanny role to `parent`). Sign up normally with the email you want, then promote it:

```bash
docker exec -i supabase_db_nanny_app psql -U postgres -d postgres -c "
alter table public.users disable trigger users_protect_role_status;
update public.users set role='admin' where email='you@example.com';
alter table public.users enable trigger users_protect_role_status;
"
```

Matches compute regardless of the *viewing* profile's own moderation status; a profile only becomes visible to (and searchable by) the other side once approved. Approving a profile now also recomputes its matches against everyone already approved on the other side, so nothing needs re-editing after approval.

The UI is bilingual (English + Arabic, with full RTL layout) via `next-intl`. Routes are locale-prefixed (`/en/...`, `/ar/...`); pages live under `src/app/[locale]/`, copy lives in `messages/en.json` and `messages/ar.json`. Locations and languages carry `name_en`/`name_ar`/`name_fr` in the DB already, so French can be added later by adding `"fr"` to `src/i18n/routing.ts` and a `messages/fr.json`. Zod validation error messages are still English-only.

## Getting started

Requires Node 20+, Docker (for local Supabase), and the Supabase CLI (invoked here via `npx`).

```bash
npm install

# start local Postgres + Auth + Storage (Docker)
npx supabase start

# copy the local keys it prints into .env.local (see .env.local.example)
npx supabase status -o env

npm run dev
```

App runs at http://localhost:3000. Local Supabase Studio runs at http://127.0.0.1:54323, and Mailpit (catches confirmation/reset emails locally) at http://127.0.0.1:54324.

### Database changes

Schema lives in `supabase/migrations/`. After editing a migration:

```bash
npx supabase db reset   # reapplies all migrations + seed data from scratch
```

Never edit an already-applied/committed migration in place once it's shared — add a new one.

### Useful commands

```bash
npm run lint
npx tsc --noEmit
npm run build
npx supabase stop       # stop the local stack
```
