# Lebanon Nanny / Parent Matching Platform — Product Specification

Status: Draft implementation blueprint, derived from `lebanon_nanny_parent_marketplace_dev_plan.pdf`.
Purpose: serve as the single source of truth for developers (human or AI) implementing the MVP. Every page, field, validation rule, database relationship, API endpoint, matching rule, permission, and acceptance criterion referenced by the roadmap (R1–R6 + Beta) should be traceable to a section below.

## Table of contents

1. Scope and non-goals
2. Roles and permissions model
3. Data model
4. Matching engine specification
5. API surface
6. Screens, fields, and validation
7. User stories and acceptance criteria (by epic)
8. Trust, safety, and moderation
9. Notifications
10. Internationalization (en / ar / fr)
11. Non-functional requirements

---

## 1. Scope and non-goals

In scope for MVP (maps to roadmap R1–R6 + Beta):

- Parent and nanny accounts with phone/email registration and verification
- Structured profiles for both sides
- Search, filters, and weighted compatibility scoring
- Interest / acceptance workflow with WhatsApp/contact handoff
- Basic admin moderation and reporting
- English / Arabic / French UI from the architecture stage

Explicitly out of scope for MVP (see plan §16 "Features to Delay"): native mobile apps, payroll, employer contracts, video calls, AI-based matching, full internal messaging, agency integrations, GPS tracking, automated background checks, complex review systems. Do not build stubs or placeholders for these — omit them entirely until a future spec revision.

---

## 2. Roles and permissions model

Three roles, stored on `users.role`: `parent`, `nanny`, `admin`. A user has exactly one role for the MVP (no dual-role accounts).

| Capability | Parent | Nanny | Admin |
|---|---|---|---|
| Create/edit own profile | ✅ (parent_profiles) | ✅ (nanny_profiles) | ❌ |
| View own profile (all fields incl. private) | ✅ | ✅ | ✅ (all users) |
| View other profiles | Nanny profiles: public fields only, contact hidden until match is mutual | Parent profiles: public fields only, contact hidden until match is mutual | ✅ all fields, incl. moderation metadata |
| Search / browse | Nannies only | Families (recommended matches) only | N/A (uses admin portal instead) |
| Send interest | To nanny_profiles | To parent_profiles (accept an inbound match, or express interest in a suggested family) | ❌ |
| Accept/decline interest | ❌ (parent-initiated model: parent sends interest, nanny accepts) — see §7.4 for exact directionality | ✅ | ❌ |
| View unlocked contact info | Only after `matches.status = mutual` with that counterpart | Only after `matches.status = mutual` | ✅ always |
| Report a user | ✅ | ✅ | N/A |
| Approve/reject profiles | ❌ | ❌ | ✅ |
| Suspend accounts | ❌ | ❌ | ✅ |
| Manage verification badges | ❌ | ❌ | ✅ |
| Manage locations/languages reference data | ❌ | ❌ | ✅ |
| View analytics | ❌ | ❌ | ✅ |

Enforcement: Postgres Row-Level Security (RLS) on every table (Supabase). `admin` role is granted via a `service_role`-gated Next.js API route, never via a client-side RLS bypass. RLS policy sketches are given per-table in §3.

---

## 3. Data model

Target: PostgreSQL via Supabase. All tables use `uuid` primary keys (`gen_random_uuid()`), `created_at timestamptz default now()`, `updated_at timestamptz default now()` (maintained by a shared `set_updated_at()` trigger), unless noted otherwise.

### 3.1 `users`

Mirrors/extends `auth.users` (Supabase Auth). One row per authenticated identity.

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK, = `auth.users.id` |
| role | text | not null, check in `('parent','nanny','admin')`, immutable after signup (no self-service role switch) |
| email | text | unique, nullable if phone-only signup |
| phone | text | unique, nullable if email-only signup, E.164 format, Lebanese numbers validated as `+961` + local number |
| email_verified_at | timestamptz | nullable |
| phone_verified_at | timestamptz | nullable |
| preferred_language | text | not null, default `'en'`, check in `('en','ar','fr')` |
| status | text | not null, default `'active'`, check in `('active','suspended','deleted')` |
| last_login_at | timestamptz | nullable |
| created_at, updated_at | timestamptz | |

Constraint: `email is not null or phone is not null` (at least one identifier).

RLS: a row is readable/writable by `auth.uid() = id`; admins read/write all via service role; `role` and `id` are never writable by the owning user after insert (handled by a `BEFORE UPDATE` trigger rejecting changes to `role`).

### 3.2 `locations`

Structured Lebanese geography (plan §7), self-referencing for the region → district → area hierarchy shown in the example (Beirut → Achrafieh/Hamra/Verdun; Metn → Antelias/Jal el Dib/Zalka/Broummana; Baabda → Hazmieh/Baabda/Hadath; Keserwan → Jounieh/Kaslik/Zouk).

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| name_en, name_ar, name_fr | text | not null |
| level | text | not null, check in `('governorate','district','area')` |
| parent_location_id | uuid | FK → locations.id, nullable (null only for `level = 'governorate'`) |
| sort_order | int | default 0, controls display order in pickers |

Seed data ships as a migration (not user-editable at runtime except by admin, see §3.10 admin capability). Read is public (unauthenticated included, needed for pre-signup browsing); writes restricted to admin.

### 3.3 `languages`

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| code | text | unique, ISO 639-1 (`en`, `ar`, `fr`, extensible) |
| name_en, name_ar, name_fr | text | not null |

Read public; writes admin-only.

### 3.4 `parent_profiles`

One row per parent user (1:1 with `users` where `role = 'parent'`).

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users.id, unique, not null |
| full_name | text | not null, 2–80 chars |
| location_id | uuid | FK → locations.id (`level = 'area'`), not null |
| num_children | smallint | not null, 1–10 |
| children_age_ranges | text[] | not null, min 1 element, each in `('newborn','infant','toddler','preschool','school_age','teen')` |
| schedule_type | text | not null, check in `('full_time','part_time','either')` |
| live_arrangement | text | not null, check in `('live_in','live_out','either')` |
| desired_start_date | date | not null, `>= current_date` on insert |
| salary_min | integer | not null, >= 0 (USD, MVP uses a single currency — see §11) |
| salary_max | integer | not null, `>= salary_min` |
| transportation_required | boolean | not null, default false |
| additional_duties | text[] | default `'{}'`, free-form tags (e.g. `light_housekeeping`, `cooking`, `pet_care`) |
| family_description | text | nullable, max 1000 chars |
| status | text | not null, default `'draft'`, check in `('draft','active','paused')` — only `active` profiles are matched/searched |
| moderation_status | text | not null, default `'pending'`, check in `('pending','approved','rejected')` — see §8 |
| profile_completion_pct | int | generated/computed at write time from required-field fill rate, 0–100 |

Join tables:

- `parent_profile_languages (parent_profile_id, language_id)` — preferred languages, composite PK.

RLS: owner (`auth.uid() = user_id`) full read/write while `moderation_status != 'approved'` is irrelevant to write access (owner can always edit their own row); `status = 'active' and moderation_status = 'approved'` rows are readable by any authenticated `nanny` (public-field subset enforced at the API/view layer, not RLS column-level — see §3.9 view); admin full access.

### 3.5 `nanny_profiles`

One row per nanny user.

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users.id, unique, not null |
| full_name | text | not null, 2–80 chars |
| profile_photo_url | text | nullable (storage bucket path); profile cannot move to `status = 'active'` without a photo — see acceptance criteria §7.2 |
| location_id | uuid | FK → locations.id (`level = 'area'`), not null |
| work_radius_km | smallint | not null, 1–50 |
| employment_type | text | not null, check in `('full_time','part_time','either')` |
| live_arrangement_pref | text | not null, check in `('live_in','live_out','either')` |
| availability | jsonb | not null, shape: `{ "days": ["mon",...], "start_time": "HH:MM", "end_time": "HH:MM" }` |
| years_experience | numeric(4,1) | not null, >= 0 |
| expected_salary_min | integer | not null, >= 0 |
| expected_salary_max | integer | not null, `>= expected_salary_min` |
| has_transportation | boolean | not null, default false |
| can_drive | boolean | not null, default false |
| certifications | text[] | default `'{}'` (free-form tags, e.g. `first_aid_cpr`, `early_childhood_ed`) |
| short_intro | text | nullable, max 500 chars |
| status | text | not null, default `'draft'`, check in `('draft','active','paused')` |
| moderation_status | text | not null, default `'pending'`, check in `('pending','approved','rejected')` |
| profile_completion_pct | int | computed |

Join table:

- `nanny_profile_languages (nanny_profile_id, language_id)`

RLS mirrors §3.4 (owner full access; approved+active rows readable by `parent` role; admin full access).

### 3.6 `nanny_experience`

Normalizes "newborn and child-age experience" (plan §3) into queryable rows for scoring instead of a single free-text field.

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| nanny_profile_id | uuid | FK → nanny_profiles.id, not null |
| age_group | text | not null, check in `('newborn','infant','toddler','preschool','school_age','teen')` |
| years_experience | numeric(4,1) | not null, >= 0 |

Unique constraint on `(nanny_profile_id, age_group)`.

### 3.7 `matches`

The relationship record between one parent profile and one nanny profile. One row per unordered pair; created either by the matching engine (as a "suggested" candidate surfaced in search) or lazily on first interest action.

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| parent_profile_id | uuid | FK → parent_profiles.id, not null |
| nanny_profile_id | uuid | FK → nanny_profiles.id, not null |
| score | numeric(5,2) | not null, 0–100, computed by matching engine (§4) |
| score_breakdown | jsonb | not null, per-criterion raw + weighted scores, for UI display ("Location ✓ \| Schedule ✓ \| ...") |
| status | text | not null, default `'suggested'`, check in `('suggested','parent_interested','nanny_interested','mutual','declined_by_parent','declined_by_nanny','expired')` |
| initiated_by | text | nullable, check in `('parent','nanny')` — who sent the first interest signal |
| interest_expires_at | timestamptz | nullable — an unanswered interest auto-expires after 14 days (see §7.4) |
| responded_at | timestamptz | nullable |

Unique constraint on `(parent_profile_id, nanny_profile_id)`.

RLS: readable/writable (status transitions only, never score) by either the owning parent or owning nanny of the pair; admin full access. Score/score_breakdown are written only by the server-side matching engine (service role), never by client RLS.

### 3.8 `references`

Nanny-supplied references (plan §6, "later enhancement" for verification but the record itself is MVP).

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| nanny_profile_id | uuid | FK → nanny_profiles.id, not null |
| reference_name | text | not null |
| relationship | text | not null (e.g. `former_employer`) |
| contact_phone | text | nullable |
| contact_email | text | nullable |
| verified_at | timestamptz | nullable |
| verified_by_admin_id | uuid | FK → users.id, nullable |

RLS: owner (nanny) can create/read/delete own; admin full access; not publicly readable (contact info of the reference is PII).

### 3.9 `verification`

Verification badges, decoupled from the profile tables so badge state and history are auditable (plan §6: "verification should be visible without exposing sensitive personal documents publicly").

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users.id, not null |
| type | text | not null, check in `('phone','email','identity','reference')` |
| status | text | not null, default `'pending'`, check in `('pending','verified','rejected')` |
| document_ref | text | nullable — storage path to a private bucket, admin-only read, never exposed via any public view |
| verified_by_admin_id | uuid | FK → users.id, nullable |
| verified_at | timestamptz | nullable |

`document_ref` lives in a private Supabase Storage bucket with an RLS policy restricting reads to `service_role`/admin only. Public profile views expose only a derived boolean/badge, never `document_ref`.

RLS: owner can insert/read their own rows (to see pending/rejected status) but cannot set `status` or `verified_by_admin_id`; admin full access.

### 3.10 `reports`

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| reporter_user_id | uuid | FK → users.id, not null |
| reported_user_id | uuid | FK → users.id, not null |
| reason | text | not null, check in `('inappropriate_content','harassment','fraud_scam','fake_profile','other')` |
| details | text | nullable, max 1000 chars |
| status | text | not null, default `'open'`, check in `('open','reviewing','resolved','dismissed')` |
| resolved_by_admin_id | uuid | FK → users.id, nullable |
| resolved_at | timestamptz | nullable |
| resolution_notes | text | nullable |

RLS: reporter can insert and read own reports; reported user has no read access to reports about them; admin full access.

### 3.11 `favorites`

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users.id, not null |
| favorited_profile_id | uuid | not null (either a parent_profiles.id or nanny_profiles.id) |
| profile_type | text | not null, check in `('parent','nanny')` |

Unique constraint `(user_id, favorited_profile_id)`. RLS: owner-only read/write.

### 3.12 `notifications`

| Column | Type | Constraints |
|---|---|---|
| id | uuid | PK |
| user_id | uuid | FK → users.id, not null |
| type | text | not null, check in `('new_match','interest_received','interest_accepted','profile_approved','profile_rejected','verification_updated','report_resolved')` |
| payload | jsonb | not null — type-specific data (e.g. `{ "match_id": ... }`) |
| read_at | timestamptz | nullable |

RLS: owner-only read; insert restricted to service role (server writes notifications, never the client).

### 3.13 Cross-cutting: "public view" pattern for pre-match privacy

Because contact fields (phone, email, exact full name in some markets) must stay hidden until `matches.status = 'mutual'`, the API layer (not raw table SELECT) is the only supported read path for cross-role profile browsing. Concretely:

- `nanny_public_profile` and `parent_public_profile` Postgres views strip `users.email`/`users.phone` and any field not listed in §6's "public fields" per screen.
- The Next.js API routes in §5 query these views for search/browse; direct table access from the client for cross-role reads is blocked by RLS (§3.4/3.5 already scope cross-role SELECT to the view, not the base table, via `security_invoker` view design or a `SECURITY DEFINER` function — implementers should pick one approach and document it in the migration, but the constraint "never leak contact info pre-match" is the acceptance criterion, not the specific mechanism).

---

## 4. Matching engine specification

TypeScript service, pure functions, no AI (plan §8/§14 R4). Input: one `parent_profiles` row (+ its language join rows) and one `nanny_profiles` row (+ its language and `nanny_experience` join rows). Output: `{ score: number (0-100), breakdown: CriterionResult[] }`.

### 4.1 Criteria, weights, and per-criterion scoring formula

| Criterion | Weight | Formula (returns 0.0–1.0 before weighting) |
|---|---|---|
| Location | 25% | 1.0 if same `area`; 0.6 if same `district` (parent location); 0.3 if same `governorate`; 0.0 otherwise. If nanny `work_radius_km` and both locations carry lat/lng, an actual-distance check may override the tier to 1.0 when within radius (optional enhancement, not required for MVP correctness) |
| Availability | 20% | Fraction of parent's `required` days (derived from `schedule_type`) present in nanny's `availability.days`, capped at 1.0; if parent requires specific hours, additionally require nanny's `start_time`–`end_time` window to contain the parent's required window, else halve the day-fraction score |
| Full-time / part-time | 15% | 1.0 if exact match, or either side is `either`; 0.0 otherwise |
| Live-in / live-out | 10% | 1.0 if exact match, or either side is `either`; 0.0 otherwise |
| Salary overlap | 10% | `overlap = max(0, min(parent.salary_max, nanny.expected_salary_max) - max(parent.salary_min, nanny.expected_salary_min))`; `union = max(parent.salary_max, nanny.expected_salary_max) - min(parent.salary_min, nanny.expected_salary_min)`; score = `overlap / union` (0 if `union = 0` or ranges don't overlap) |
| Language | 8% | `count(nanny languages ∩ parent preferred languages) / count(parent preferred languages)`, capped at 1.0 (0 if parent listed no preferred languages → treat as automatic 1.0, no penalty for an unspecified preference) |
| Child-age experience | 7% | For each of the parent's `children_age_ranges`, 1 if nanny has a `nanny_experience` row for that age group, else 0; average across all the parent's listed age ranges |
| Transportation | 5% | 1.0 if `parent.transportation_required = false`; else 1.0 if `nanny.has_transportation = true`, 0.0 otherwise |

Total score = `Σ (criterion_score × weight)`, expressed 0–100.

### 4.2 Thresholds (plan §4)

- 90–100: "Excellent match"
- 75–89: "Good match"
- 60–74: "Possible match"
- < 60: not actively recommended (excluded from default search results and from the "Recommended nannies" / "Family opportunities" feeds; still reachable via explicit search+filters if the user overrides defaults)

### 4.3 When the engine runs

- On profile create/update (`status` transitions to `active` and on every subsequent edit while active): recompute scores against all counterpart `active`+`approved` profiles, upsert `matches` rows. Implemented as a Next.js API route triggered by a Supabase database webhook/trigger on `parent_profiles`/`nanny_profiles` UPDATE, not client-triggered, so a stale client can't skip recomputation.
- On demand for the search/browse endpoints (§5.4), scores are read from the precomputed `matches` table, not recomputed per request — computation is server-side and asynchronous relative to browsing.

### 4.4 Display

Each match card shows the checklist format from plan §4 example: `92% Match — Location ✓ | Schedule ✓ | Salary ✓ | Language ✓ | Child-age experience ✓ | Transportation ✗`, where a criterion shows ✓ if its raw (unweighted) score is `>= 0.75`, else ✗. This threshold is a UI-only display rule and does not affect the numeric score.

---

## 5. API surface

Next.js Route Handlers under `/api`. Auth via Supabase session (JWT in cookie/header); role checks are enforced server-side on every handler in addition to RLS (defense in depth — RLS is the source of truth, API-layer checks fail fast with a proper error).

Convention: all list endpoints paginate (`?page=1&pageSize=20`, max `pageSize=50`); all mutating endpoints validate with a shared Zod schema mirroring §3/§6 field constraints and return `400` with field-level errors on failure.

### 5.1 Auth & account

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | none | `{ role, email? , phone?, password }`. Creates `auth.users` + `users` row. Requires `email` or `phone`. |
| POST | `/api/auth/verify-phone/request` | session | Triggers OTP SMS to `users.phone`. |
| POST | `/api/auth/verify-phone/confirm` | session | `{ code }`. Sets `phone_verified_at`, writes `verification` row `type='phone', status='verified'`. |
| POST | `/api/auth/verify-email/confirm` | none (token in link) | Standard Supabase email-confirmation callback. |
| POST | `/api/auth/recover` | none | `{ email or phone }`. Sends reset link/OTP. |
| GET | `/api/auth/me` | session | Returns `users` row + role-appropriate profile summary. |

### 5.2 Profiles

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/profile` | session | Own full profile (parent or nanny, based on role). |
| POST | `/api/profile` | session, role-scoped | Create own profile (one-time; 409 if one already exists). |
| PATCH | `/api/profile` | session, owner | Partial update; triggers moderation re-review if `status` moves `draft → active` for the first time, or if key fields change after prior approval (see §8.2). |
| POST | `/api/profile/photo` | session, nanny only | Multipart upload to Storage bucket `nanny-photos`; returns `profile_photo_url`. |
| GET | `/api/profile/:id/public` | session | Cross-role public-view fetch (uses the views in §3.13); 403 if requester's role can't view that profile type, 404 if not `active`+`approved` (unless requester is admin or the profile owner). |

### 5.3 Reference data

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/locations?level=&parent_id=` | none | Location tree, for cascading pickers. |
| GET | `/api/languages` | none | Supported languages list. |

### 5.4 Search & matching

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/search/nannies?location=&employment_type=&live_arrangement=&salary_min=&salary_max=&languages=&min_experience=&transportation=&sort=score` | session, parent | Filtered + scored results from `matches` joined to `nanny_public_profile`, default filtered to score `>= 60`. |
| GET | `/api/search/families` | session, nanny | Same, symmetric, against `parent_public_profile`. |
| GET | `/api/matches/:id` | session, party to the match or admin | Full match detail incl. `score_breakdown`. |

### 5.5 Interest / acceptance workflow

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/matches/:id/interest` | session, party to the match | Records interest from the caller's side. Transitions `suggested → parent_interested` / `nanny_interested`, or `{other}_interested → mutual` if the counterpart already expressed interest. Sets `interest_expires_at = now() + 14 days` when moving out of `suggested`. |
| POST | `/api/matches/:id/decline` | session, party to the match | Transitions to `declined_by_parent` / `declined_by_nanny`. Terminal state — no further transitions on this match row. |
| GET | `/api/matches/:id/contact` | session, party to the match | 403 unless `status = 'mutual'`; returns counterpart's phone/email/WhatsApp-formatted link. |

### 5.6 Trust & safety

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/reports` | session | `{ reported_user_id, reason, details }`. |
| POST | `/api/favorites` / `DELETE /api/favorites/:id` | session | Save/unsave a profile. |
| GET | `/api/notifications` | session | Own notifications, paginated. |
| PATCH | `/api/notifications/:id/read` | session, owner | Marks read. |

### 5.7 Admin (all routes require `role = 'admin'`, service-role DB access)

| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/users?status=&role=&q=` | Search/list users. |
| PATCH | `/api/admin/users/:id/status` | Suspend/reactivate/delete. |
| GET | `/api/admin/profiles?moderation_status=pending` | Moderation queue. |
| PATCH | `/api/admin/profiles/:id/moderation` | `{ profile_type, status: 'approved'|'rejected', notes? }`. Triggers `profile_approved`/`profile_rejected` notification. |
| PATCH | `/api/admin/verification/:id` | `{ status: 'verified'|'rejected' }`. |
| GET | `/api/admin/reports?status=open` | Moderation queue for reports. |
| PATCH | `/api/admin/reports/:id` | `{ status, resolution_notes }`. |
| GET | `/api/admin/locations` / POST / PATCH / DELETE | Manage location tree. |
| GET | `/api/admin/languages` / POST / PATCH / DELETE | Manage language list. |
| GET | `/api/admin/analytics` | Registration/engagement counts (signups by role/day, active profiles, mutual matches, report volume) — basic aggregate queries, no BI tooling in MVP. |

---

## 6. Screens, fields, and validation

Screen list per plan §11. For each screen: purpose, fields shown, and validation beyond what §3 already states at the DB layer (client-side validation should mirror, not replace, server-side checks).

### 6.1 Public

- **Homepage** — headline "Find the right nanny for your family.", subhead "Trusted childcare connections across Lebanon.", two primary CTAs ("I'm looking for a nanny" / "I'm looking for a family"), 3-step explainer (create a profile → see compatible matches → connect safely).
- **How It Works** — static content, per-role explainer, links into the correct signup flow.
- **Find a Nanny / Find a Family** — marketing/landing variants of homepage scoped to one role, CTA leads to signup.
- **Login** — email-or-phone + password. Error states: invalid credentials (generic message, no user-enumeration), account suspended (specific message + support contact).
- **Registration** — role selection (parent/nanny) if not already implied by entry point, identifier (email and/or phone — at least one required), password (min 8 chars, at least 1 letter + 1 number), language preference picker, terms acceptance checkbox (required).

### 6.2 Parent

- **Onboarding** (multi-step form, saves as `draft` until final step, matches `parent_profiles` fields 1:1):
  1. Name + area (cascading governorate → district → area picker from `/api/locations`)
  2. Number of children + age ranges (multi-select chips)
  3. Schedule: full-time/part-time/either, live-in/live-out/either, desired start date (date picker, cannot be in the past)
  4. Salary range (min/max sliders or inputs, `max >= min` inline validation)
  5. Preferred languages (multi-select from `/api/languages`), transportation requirement (toggle)
  6. Additional duties (multi-select tags), family/job description (textarea, 1000 char counter)
  Final step sets `status = 'active'`, submits for moderation (`moderation_status = 'pending'`).
- **Dashboard** — completion state banner if `moderation_status != 'approved'`; summary of new matches, pending interests awaiting nanny response, mutual matches with contact-unlock CTA; notification feed.
- **Nanny results** — filterable/sortable list (see §5.4 filters), each card shows the match-checklist format (§4.4), photo, area, headline stats (experience years, employment type, live arrangement); "Send interest" CTA; empty state when zero results `>= 60`.
- **Nanny profile (detail)** — public fields only pre-match: photo, area (district-level, not exact area, until mutual — privacy-by-default), work radius, employment type, live arrangement pref, availability summary, years experience, age-group experience list, languages, certifications, short intro, verification badges. Contact fields render as a locked/blurred placeholder with "Send interest to unlock contact" until `matches.status = 'mutual'`.

### 6.3 Nanny

- **Onboarding** (multi-step, mirrors §6.2 structure against `nanny_profiles`):
  1. Name, profile photo (required before `active`), area, work radius
  2. Employment type + live arrangement preference
  3. Availability (day multi-select + time range picker)
  4. Languages, years of experience
  5. Newborn/child-age experience (per-age-group years input, maps to `nanny_experience` rows)
  6. Expected salary range, driving/transportation (two toggles: can_drive, has_transportation)
  7. Certifications (multi-select tags + "other" free text), references (optional at this step — can be added later from settings), short personal introduction (500 char counter)
- **Dashboard** — same pattern as parent dashboard, family-facing.
- **Family opportunities** — equivalent of "Nanny results" scoped to `parent_public_profile`; parent's exact area also privacy-gated to district-level pre-match; family/job description and salary range are shown (these are needed pre-match for the nanny to decide whether to express interest — this is an intentional asymmetry from the nanny-profile detail screen, since salary/description aren't PII).

### 6.4 Shared

- **Matches** — unified list across all `matches.status` values for the current user, grouped by state (New suggestions / Awaiting response / Mutual — contact unlocked / Declined).
- **Notifications** — chronological list, mark-as-read.
- **Settings** — language preference, password change, phone/email re-verification, notification preferences (future: currently no per-channel opt-out needed for MVP since there's a single in-app channel — see §9), account deletion request.
- **Account verification** — shows current badge states (phone/email/identity/reference) per §3.9, CTA to start phone/email verification; identity/reference verification are admin/operationally-driven and show "pending" with no self-service action in MVP (per plan §6, identity verification ships "when operationally available").

---

## 7. User stories and acceptance criteria (by epic)

Format: `As a <role>, I want <capability>, so that <benefit>.` followed by acceptance criteria in Given/When/Then form. Only non-obvious or edge-case-bearing criteria are enumerated — trivial CRUD happy paths are implied by §3/§5/§6 and not repeated here.

### 7.1 Authentication (R1)

**Story:** As a new user, I want to register with either my phone or email, so that I can use whichever contact method I have.

- Given a signup with only `phone` and no `email`, when submitted, then the account is created and `users.email` is null.
- Given a signup with neither `phone` nor `email`, when submitted, then the request is rejected with `400` and a field-level error, no partial `auth.users` row is left behind (wrap in a transaction / clean up on failure).
- Given a `role` was selected at signup, when the user later calls any endpoint that would change `role`, then the request is rejected — role is immutable post-signup (§3.1).

**Story:** As a user, I want my phone verified, so that other users can trust I'm reachable.

- Given a phone verification code was requested, when the user submits an expired or wrong code, then the attempt is rejected without revealing which (avoid code-guessing oracle) and a rate limit applies (max 5 attempts per 15 minutes).
- Given phone verification succeeds, when the badge is checked from any profile view, then `phone_verified_at is not null` renders a "Phone Verified" badge and no other user-facing endpoint exposes the raw phone number pre-match.

### 7.2 Profiles (R2)

**Story:** As a parent, I want to build a structured profile, so that nannies can evaluate fit at a glance.

- Given a parent profile missing any required field from §3.4, when the user attempts to move `status` from `draft` to `active`, then the transition is rejected with the list of missing fields.
- Given `desired_start_date` in the past, when saved, then rejected (checked both client-side and server-side; DB constraint enforces `>=` at insert time only — updates must be re-validated in the API layer since a DB CHECK against `current_date` isn't stable across rows created earlier).

**Story:** As a nanny, I want to build a structured profile including a photo, so that families see who I am.

- Given a nanny profile with no `profile_photo_url`, when the user attempts `status: 'draft' → 'active'`, then rejected — photo is mandatory for activation (not for saving a draft).
- Given a nanny adds `nanny_experience` rows, when two rows are submitted for the same `age_group`, then the second write upserts (unique constraint, not a duplicate error surfaced to the user — merge on save).

**Story:** As a parent or nanny, I want my profile reviewed before it's visible to the other side, so the marketplace stays trustworthy.

- Given a profile reaches `status = 'active'` for the first time, when saved, then `moderation_status` is set/kept at `'pending'` and the profile is excluded from all search/matching results and from the counterpart's browse feed until an admin sets `moderation_status = 'approved'`.
- Given an already-`approved` profile has a material field changed (name, photo, location, salary — fields that affect trust or matching, as opposed to e.g. toggling a certification tag), when saved, then `moderation_status` resets to `'pending'` and the profile remains visible with its last-approved snapshot... **decision needed at implementation time**: MVP default is simpler — any edit to an approved profile re-queues it as `pending` and it is immediately hidden from new searches (existing `matches` rows are untouched) until re-approved, favoring safety over continuity. Document this choice in the admin-facing changelog if it's revisited.

### 7.3 Search and matching (R3, R4)

**Story:** As a parent, I want nannies ranked by compatibility, so I don't have to manually compare every profile.

- Given two nanny profiles score 91% and 74% against the same parent, when the parent views default search (no explicit sort override), then results are ordered descending by score.
- Given a nanny profile scores 45% against a parent, when the parent performs a default browse, then that nanny is excluded; when the parent applies an explicit filter that happens to include her (e.g. searching by a location filter alone with no score floor), then plan intent is that only filters materially change what's excluded — **implementation rule**: explicit filters narrow within the `>= 60` floor; there is no UI path to see sub-60 matches in MVP (matches "the platform should also rank compatible profiles automatically" combined with "profiles below the minimum threshold do not need to be actively recommended").
- Given a parent edits `salary_max` downward, when saved, then all `matches` rows for that parent are recomputed asynchronously (§4.3) — the UI should not assume instant consistency; a "recalculating matches" transient state is acceptable but not required for MVP.

### 7.4 Interest / acceptance + contact handoff (R5)

**Story:** As a parent, I want to express interest in a nanny, so we can potentially connect.

- Given a `matches.status = 'suggested'` row, when the parent calls `POST /interest`, then status becomes `parent_interested`, `initiated_by = 'parent'`, `interest_expires_at` is set.
- Given `matches.status = 'parent_interested'`, when the nanny calls `POST /interest`, then status becomes `mutual`, both parties get an `interest_accepted` notification, and `GET /contact` becomes available to both.
- Given `matches.status = 'parent_interested'`, when the nanny calls `POST /decline`, then status becomes `declined_by_nanny`, terminal — no further interest calls are accepted on this match row (return `409`).
- Given `interest_expires_at` has passed with no counterpart response, when any scheduled job or next read of that row occurs, then status transitions to `expired` (a lightweight cron/Supabase scheduled function, not a hard real-time requirement for MVP — expiry can be lazily applied on read if a cron isn't provisioned yet, as long as the terminal `expired` state is eventually consistent and never blocks a fresh `suggested` match from being recomputed on next profile edit... note: since `(parent_profile_id, nanny_profile_id)` is unique, an `expired` match does not regenerate as `suggested` automatically — re-expressing interest after expiry requires an explicit "renew interest" action that resets status to the appropriate `*_interested` state, not a new row).
- Given `matches.status != 'mutual'`, when either party calls `GET /contact`, then `403`, and no phone/email is included in any response body reachable by that party (verify at the serializer level, not just the route guard, to avoid an over-fetching bug leaking contact fields in a nested join).

### 7.5 Trust and safety (R6)

**Story:** As a user, I want to report a profile, so the platform can act on bad behavior.

- Given a report is filed, when saved, then `status = 'open'` and it appears in the admin reports queue; the reported user receives no notification (avoid tipping off, per standard moderation practice) and has no visibility into reports against them.
- Given an admin resolves a report with an account suspension, when `users.status` becomes `'suspended'`, then that user's active session is invalidated on next request (401, forcing re-auth which then fails against `status != 'active'`), and their profile is immediately excluded from all search/browse results regardless of `moderation_status`.

### 7.6 Admin (R6)

**Story:** As an admin, I want a moderation queue, so I can approve/reject profiles before they go live.

- Given the queue is filtered `moderation_status=pending`, when an admin approves, then the profile becomes searchable within the next matching-engine run (§4.3) and the owning user gets a `profile_approved` notification.
- Given an admin rejects with notes, when saved, then the owner gets a `profile_rejected` notification including the notes, and the profile stays excluded from search until the owner edits and it's re-reviewed.

---

## 8. Trust, safety, and moderation

### 8.1 Verification badges (plan §6)

Four badge types (§3.9): phone, email, identity, reference. Phone and email are self-service (§7.1). Identity verification is admin-driven and gated behind "when operationally available" — MVP ships the schema and an admin-only manual-verify action, no automated document-verification vendor integration. Reference verification is explicitly a later enhancement per the plan — the `references` table and CRUD exist in MVP, but the *verification* of those references (contacting them) is a manual admin workflow, not built as a product feature in R1–R6.

### 8.2 Profile moderation

Every profile passes through admin review before becoming visible cross-role (§7.2). This is a deliberate trust gate for a childcare marketplace and should not be bypassed even under launch-speed pressure — flag this explicitly to the user if a future request asks to skip it.

### 8.3 Reporting and blocking

`reports` table + admin queue as specified in §3.10/§7.5. "Block" is not a separately named table in plan §6's bullet list ("Report and block controls") — implement it as a `users.status`-independent per-relationship suppression: add a `blocks (blocker_user_id, blocked_user_id, created_at)` table (composite PK), and filter both search results and `matches` visibility to exclude any pair where a block exists in either direction. This is a small addition beyond the plan's explicit §9 table list but is required to satisfy the "block controls" requirement in §6 — call it out to the user as a minor schema addition versus the original plan.

---

## 9. Notifications

Single channel for MVP: in-app (`notifications` table + `GET /api/notifications`), no email/SMS/push dispatch required (WhatsApp is used only for the post-match contact handoff itself, not as a notification channel — plan §1/§17). Types enumerated in §3.12. No per-channel preference UI needed since there's only one channel; the "notification preferences" mention in §6.4 Settings should ship as a simple all-notifications on/off toggle at most, not a per-type matrix — keep it minimal unless the user asks for more.

---

## 10. Internationalization (en / ar / fr)

Plan §7: "English, Arabic and French support from the architecture stage." Implementation implications:

- All user-facing static copy lives in locale resource files from day one (e.g. `next-intl` or equivalent App Router i18n routing), not hardcoded strings — retrofitting i18n later is far more expensive than starting with it.
- `locations` and `languages` tables carry `name_en/name_ar/name_fr` columns (§3.2/§3.3) specifically so reference data doesn't need a separate translation layer.
- Arabic requires RTL layout support; the design system (Tailwind) should use logical CSS properties (`ms-`/`me-` instead of `ml-`/`mr-`, etc.) from the start rather than a bolted-on RTL stylesheet.
- User-generated free text (`family_description`, `short_intro`, report `details`) is stored as-is in whatever language the user typed it — no machine translation in MVP.
- `users.preferred_language` drives the UI locale on login; unauthenticated visitors get browser-locale detection with English fallback.

---

## 11. Non-functional requirements

- **Mobile-first**: plan §7 explicitly calls this out. All screens in §6 should be designed mobile-first (single-column, touch targets, bottom-sheet pickers for location/age-range multi-selects) with desktop as a progressive enhancement, not the other way around.
- **Currency**: plan doesn't specify; MVP assumes a single currency (USD, commonly used alongside LBP in the Lebanese market for salary discussions) stored as plain integers in `parent_profiles`/`nanny_profiles` salary fields. If LBP support is needed later, this requires a currency column + conversion strategy — flag as a gap, don't silently guess an exchange rate.
- **Performance**: no explicit SLA in the plan; a reasonable MVP target is sub-second search response for catalog sizes in the low thousands of active profiles (well within Postgres + proper indexing on `matches.score`, `matches.parent_profile_id`, `matches.nanny_profile_id`, `parent_profiles.status`, `nanny_profiles.status`).
- **Security**: RLS on every table (§3), private Storage bucket for verification documents (§3.9), rate limiting on OTP/auth endpoints (§7.1), no contact-info leakage pre-match (§7.4) as a hard invariant, not a best-effort one.
- **Accessibility**: not called out in the source plan; default to standard semantic HTML + WCAG AA color contrast as a baseline, no bespoke a11y features required for MVP sign-off.

---

## Appendix: gaps and decisions not fully specified by the source plan

These are called out explicitly rather than silently resolved, per the instruction that this document should be the implementation blueprint:

1. **Currency** (§11) — plan doesn't state USD vs LBP; assumed USD, revisit if wrong.
2. **Blocking mechanism** (§8.3) — plan mentions "block controls" in a bullet but doesn't list a `blocks` table in its own §9 table list; added one.
3. **Interest directionality** (§7.4) — plan's parent journey says "Send interest → Nanny accepts," implying parent-initiates by default, but nanny journey also says "Accept interested families," which this spec reads as symmetric (either side can initiate from a `suggested` match, mirroring a modern two-sided marketplace) rather than parent-only-initiates. If the intent was strictly parent-initiates-only, the `POST /interest` endpoint and `matches.status` enum simplify by removing the nanny-initiated branch — confirm before building R5 if this matters.
4. **Approved-profile-edit re-moderation** (§7.2) — plan doesn't say whether editing an approved profile re-triggers review; this spec defaults to "yes, always," favoring safety.
5. **Multi-role accounts** — plan doesn't address whether one person could be both a parent and a nanny; this spec assumes no (one role per account) as the simpler MVP default.
6. **Availability scoring** (§4.1) — the formula as written scores the overlap between the nanny's available days and the parent's "required days," but the parent onboarding form (§6.2) only collects a full-time/part-time/either preference, not specific days — that's covered by the separate "full-time/part-time" criterion. Implemented instead as the breadth of the nanny's stated availability (`days.length / 7`), a proxy for scheduling flexibility rather than literal day-overlap. Revisit if parents start providing specific required days.
7. **Recompute-on-approval** (§4.3) — resolved in R6: `PATCH /api/admin/profiles/[id]/moderation` calls the same recompute used on profile create/update whenever a profile is approved, so it's immediately scored against everyone already approved on the other side.
8. **Suspension enforcement** (§10 "Suspend accounts") — the plan lists suspending accounts as an admin capability but doesn't specify enforcement mechanics. Supabase Auth has no concept of our `users.status` column, so a `PATCH /api/admin/users/[id]/status` call alone doesn't end an existing session. Enforced in two places: the session middleware signs out and redirects to login (with `?error=account_suspended`) on every request to a protected route if `status = 'suspended'`; the login form additionally checks status immediately after a successful `signInWithPassword` and signs back out if suspended, so a suspended user gets a clear message at the point of login rather than being bounced on their first click afterward.
