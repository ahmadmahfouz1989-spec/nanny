import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeMatchScore,
  type AgeGroup,
  type LiveArrangement,
  type NannyMatchInput,
  type ParentMatchInput,
  type ScheduleType,
} from "./engine";

type Admin = ReturnType<typeof createAdminClient>;

// profile.location_id now holds a governorate id directly.
const govRef = (locationId: string | null) => ({ governorateId: locationId });

async function loadParentInputs(admin: Admin) {
  const { data } = await admin
    .from("parent_profiles")
    .select(
      "id, location_id, schedule_type, live_arrangement, transportation_required, children_age_ranges, parent_profile_languages(language_id)",
    )
    .eq("status", "active")
    .eq("moderation_status", "approved");

  return (data ?? []).map((p) => ({
    id: p.id as string,
    input: {
      location: govRef(p.location_id as string | null),
      scheduleType: p.schedule_type as ScheduleType,
      liveArrangement: p.live_arrangement as LiveArrangement,
      transportationRequired: p.transportation_required as boolean,
      childrenAgeRanges: p.children_age_ranges as AgeGroup[],
      languageIds: (p.parent_profile_languages as { language_id: string }[]).map((l) => l.language_id),
    } satisfies ParentMatchInput,
  }));
}

async function loadNannyInputs(admin: Admin) {
  const { data } = await admin
    .from("nanny_profiles")
    .select(
      "id, location_id, employment_type, live_arrangement_pref, availability, has_transportation, nanny_profile_languages(language_id), nanny_experience(age_group)",
    )
    .eq("status", "active")
    .eq("moderation_status", "approved");

  return (data ?? []).map((n) => ({
    id: n.id as string,
    input: {
      location: govRef(n.location_id as string | null),
      employmentType: n.employment_type as ScheduleType,
      liveArrangementPref: n.live_arrangement_pref as LiveArrangement,
      availabilityDays: (n.availability as { days: string[] })?.days ?? [],
      hasTransportation: n.has_transportation as boolean,
      languageIds: (n.nanny_profile_languages as { language_id: string }[]).map((l) => l.language_id),
      experienceAgeGroups: (n.nanny_experience as { age_group: string }[]).map((e) => e.age_group as AgeGroup),
    } satisfies NannyMatchInput,
  }));
}

async function upsertMatches(
  admin: Admin,
  rows: { parent_profile_id: string; nanny_profile_id: string; score: number; score_breakdown: unknown }[],
) {
  if (rows.length === 0) return;
  await admin.from("matches").upsert(rows, { onConflict: "parent_profile_id,nanny_profile_id" });
}

export async function recomputeMatchesForParent(parentProfileId: string) {
  const admin = createAdminClient();

  const { data: parentRow } = await admin
    .from("parent_profiles")
    .select(
      "id, location_id, schedule_type, live_arrangement, transportation_required, children_age_ranges, status, moderation_status, parent_profile_languages(language_id)",
    )
    .eq("id", parentProfileId)
    .single();

  // Scores are computed as soon as the profile is active, regardless of its
  // own moderation status — cross-visibility is gated separately by RLS, so
  // pre-computing here just means scores are ready the moment it's approved.
  if (!parentRow || parentRow.status !== "active") return;

  const parentInput: ParentMatchInput = {
    location: govRef(parentRow.location_id as string | null),
    scheduleType: parentRow.schedule_type as ScheduleType,
    liveArrangement: parentRow.live_arrangement as LiveArrangement,
    transportationRequired: parentRow.transportation_required as boolean,
    childrenAgeRanges: parentRow.children_age_ranges as AgeGroup[],
    languageIds: (parentRow.parent_profile_languages as { language_id: string }[]).map((l) => l.language_id),
  };

  const nannies = await loadNannyInputs(admin);
  const rows = nannies.map(({ id, input }) => {
    const { score, breakdown } = computeMatchScore(parentInput, input);
    return { parent_profile_id: parentProfileId, nanny_profile_id: id, score, score_breakdown: breakdown };
  });

  await upsertMatches(admin, rows);
}

export async function recomputeMatchesForNanny(nannyProfileId: string) {
  const admin = createAdminClient();

  const { data: nannyRow } = await admin
    .from("nanny_profiles")
    .select(
      "id, location_id, employment_type, live_arrangement_pref, availability, has_transportation, status, moderation_status, nanny_profile_languages(language_id), nanny_experience(age_group)",
    )
    .eq("id", nannyProfileId)
    .single();

  if (!nannyRow || nannyRow.status !== "active") return;

  const nannyInput: NannyMatchInput = {
    location: govRef(nannyRow.location_id as string | null),
    employmentType: nannyRow.employment_type as ScheduleType,
    liveArrangementPref: nannyRow.live_arrangement_pref as LiveArrangement,
    availabilityDays: (nannyRow.availability as { days: string[] })?.days ?? [],
    hasTransportation: nannyRow.has_transportation as boolean,
    languageIds: (nannyRow.nanny_profile_languages as { language_id: string }[]).map((l) => l.language_id),
    experienceAgeGroups: (nannyRow.nanny_experience as { age_group: string }[]).map((e) => e.age_group as AgeGroup),
  };

  const parents = await loadParentInputs(admin);
  const rows = parents.map(({ id, input }) => {
    const { score, breakdown } = computeMatchScore(input, nannyInput);
    return { parent_profile_id: id, nanny_profile_id: nannyProfileId, score, score_breakdown: breakdown };
  });

  await upsertMatches(admin, rows);
}
