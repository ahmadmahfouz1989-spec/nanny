// Cutover check for the nanny → generic migration:
//  1. scores every parent × nanny pair twice -- once from the legacy tables
//     (exactly as the old recompute.ts built its inputs) and once from the
//     migrated generic_profiles rows -- and fails on any difference;
//  2. checks every stored nanny generic_matches score against nanny's
//     rubric (the old app could have re-scored copies with the wrong one
//     while the migration ran ahead of the code deploy).
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/check-nanny-score-parity.ts
//
// Read-only unless --fix, which rewrites wrong stored scores (step 2).
// Needs the legacy tables to still exist (i.e. before the clean-up
// migration that drops them).

import { createClient } from "@supabase/supabase-js";
import {
  computeMatchScore,
  nannyInputFromProfile,
  parentInputFromProfile,
  type AgeGroup,
  type LiveArrangement,
  type NannyMatchInput,
  type ParentMatchInput,
  type ScheduleType,
} from "../src/lib/matching/engine.ts";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(2);
}
const db = createClient(url, key, { auth: { persistSession: false } });

async function all<T>(query: PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data ?? [];
}

type LegacyParent = {
  id: string;
  location_id: string | null;
  schedule_type: ScheduleType;
  needed_days: string[] | null;
  live_arrangement: LiveArrangement;
  transportation_required: boolean;
  children_age_ranges: AgeGroup[];
  parent_profile_languages: { language_id: string }[];
};
type LegacyNanny = {
  id: string;
  location_id: string | null;
  employment_type: ScheduleType;
  live_arrangement_pref: LiveArrangement;
  availability: { days?: string[] } | null;
  has_transportation: boolean;
  nanny_profile_languages: { language_id: string }[];
  nanny_experience: { age_group: AgeGroup; years_experience: number | null }[];
};
type GenericRow = { id: string; location_id: string | null; attributes: Record<string, unknown> };

const legacyParentInput = (p: LegacyParent): ParentMatchInput => ({
  location: { governorateId: p.location_id },
  scheduleType: p.schedule_type,
  liveArrangement: p.live_arrangement,
  transportationRequired: p.transportation_required,
  neededDays: p.needed_days ?? [],
  childrenAgeRanges: p.children_age_ranges,
  languageIds: p.parent_profile_languages.map((l) => l.language_id),
});
const legacyNannyInput = (n: LegacyNanny): NannyMatchInput => ({
  location: { governorateId: n.location_id },
  employmentType: n.employment_type,
  liveArrangementPref: n.live_arrangement_pref,
  availabilityDays: n.availability?.days ?? [],
  hasTransportation: n.has_transportation,
  languageIds: n.nanny_profile_languages.map((l) => l.language_id),
  experienceAgeGroups: n.nanny_experience.filter((e) => (e.years_experience ?? 0) > 0).map((e) => e.age_group),
});

const [parents, nannies, generic] = await Promise.all([
  all<LegacyParent>(
    db.from("parent_profiles").select(
      "id, location_id, schedule_type, needed_days, live_arrangement, transportation_required, children_age_ranges, parent_profile_languages(language_id)",
    ),
  ),
  all<LegacyNanny>(
    db.from("nanny_profiles").select(
      "id, location_id, employment_type, live_arrangement_pref, availability, has_transportation, nanny_profile_languages(language_id), nanny_experience(age_group, years_experience)",
    ),
  ),
  all<GenericRow>(db.from("generic_profiles").select("id, location_id, attributes, categories!inner(slug)").eq("categories.slug", "nanny")),
]);

const genericById = new Map(generic.map((g) => [g.id, g]));
let pairs = 0;
const problems: string[] = [];

for (const p of parents) {
  const gp = genericById.get(p.id);
  if (!gp) {
    problems.push(`parent ${p.id} missing from generic_profiles`);
    continue;
  }
  for (const n of nannies) {
    const gn = genericById.get(n.id);
    if (!gn) continue;
    pairs++;
    const before = computeMatchScore(legacyParentInput(p), legacyNannyInput(n));
    const after = computeMatchScore(parentInputFromProfile(gp), nannyInputFromProfile(gn));
    if (JSON.stringify(before) !== JSON.stringify(after)) {
      problems.push(`pair ${p.id} × ${n.id}: ${before.score} → ${after.score}`);
    }
  }
}
for (const n of nannies) if (!genericById.has(n.id)) problems.push(`nanny ${n.id} missing from generic_profiles`);

// Stored scores on the migrated/new nanny matches.
const fix = process.argv.includes("--fix");
const genericIds = new Set(generic.map((g) => g.id));
const stored = await all<{ id: string; seeker_profile_id: string; provider_profile_id: string; score: number }>(
  db.from("generic_matches").select("id, seeker_profile_id, provider_profile_id, score, categories!inner(slug)").eq("categories.slug", "nanny"),
);
let wrongStored = 0;
for (const m of stored) {
  const seeker = genericById.get(m.seeker_profile_id);
  const provider = genericById.get(m.provider_profile_id);
  if (!seeker || !provider || !genericIds.has(seeker.id)) continue;
  const expected = computeMatchScore(parentInputFromProfile(seeker), nannyInputFromProfile(provider));
  if (Number(m.score) === expected.score) continue;
  wrongStored++;
  if (fix) {
    const { error } = await db
      .from("generic_matches")
      .update({ score: expected.score, score_breakdown: expected.breakdown })
      .eq("id", m.id);
    if (error) problems.push(`could not fix stored score on ${m.id}: ${error.message}`);
  } else {
    problems.push(`stored score on match ${m.id}: ${m.score}, nanny rubric gives ${expected.score} (rerun with --fix)`);
  }
}
if (fix && wrongStored > 0) console.log(`Fixed ${wrongStored} stored nanny match score(s).`);

if (problems.length > 0) {
  console.error(`Score parity FAILED (${problems.length} problem(s) over ${pairs} pairs):`);
  for (const p of problems.slice(0, 50)) console.error("  " + p);
  process.exit(1);
}
console.log(`Score parity OK: ${pairs} parent × nanny pairs score identically (score and every criterion).`);
console.log(`Stored scores OK: ${stored.length} nanny match(es) match nanny's rubric.`);
