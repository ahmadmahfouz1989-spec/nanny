import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeMatchScore,
  type AgeGroup,
  type LiveArrangement,
  type LocationRef,
  type NannyMatchInput,
  type ParentMatchInput,
  type ScheduleType,
} from "./engine";

type Admin = ReturnType<typeof createAdminClient>;

async function loadLocationRefs(admin: Admin): Promise<Map<string, LocationRef>> {
  const { data } = await admin.from("locations").select("id, parent_location_id, level");
  const rows = data ?? [];
  const byId = new Map(rows.map((l) => [l.id, l]));
  const refs = new Map<string, LocationRef>();

  for (const loc of rows) {
    if (loc.level !== "area") continue;
    const district = loc.parent_location_id ? byId.get(loc.parent_location_id) : undefined;
    const governorate = district?.parent_location_id ? byId.get(district.parent_location_id) : undefined;
    refs.set(loc.id, {
      areaId: loc.id,
      districtId: district?.id ?? null,
      governorateId: governorate?.id ?? null,
    });
  }
  return refs;
}

async function loadParentInputs(admin: Admin, locationRefs: Map<string, LocationRef>) {
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
      location: locationRefs.get(p.location_id as string) ?? { areaId: p.location_id as string, districtId: null, governorateId: null },
      scheduleType: p.schedule_type as ScheduleType,
      liveArrangement: p.live_arrangement as LiveArrangement,
      transportationRequired: p.transportation_required as boolean,
      childrenAgeRanges: p.children_age_ranges as AgeGroup[],
      languageIds: (p.parent_profile_languages as { language_id: string }[]).map((l) => l.language_id),
    } satisfies ParentMatchInput,
  }));
}

async function loadNannyInputs(admin: Admin, locationRefs: Map<string, LocationRef>) {
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
      location: locationRefs.get(n.location_id as string) ?? { areaId: n.location_id as string, districtId: null, governorateId: null },
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
  const locationRefs = await loadLocationRefs(admin);

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
    location: locationRefs.get(parentRow.location_id as string) ?? {
      areaId: parentRow.location_id as string,
      districtId: null,
      governorateId: null,
    },
    scheduleType: parentRow.schedule_type as ScheduleType,
    liveArrangement: parentRow.live_arrangement as LiveArrangement,
    transportationRequired: parentRow.transportation_required as boolean,
    childrenAgeRanges: parentRow.children_age_ranges as AgeGroup[],
    languageIds: (parentRow.parent_profile_languages as { language_id: string }[]).map((l) => l.language_id),
  };

  const nannies = await loadNannyInputs(admin, locationRefs);
  const rows = nannies.map(({ id, input }) => {
    const { score, breakdown } = computeMatchScore(parentInput, input);
    return { parent_profile_id: parentProfileId, nanny_profile_id: id, score, score_breakdown: breakdown };
  });

  await upsertMatches(admin, rows);
}

export async function recomputeMatchesForNanny(nannyProfileId: string) {
  const admin = createAdminClient();
  const locationRefs = await loadLocationRefs(admin);

  const { data: nannyRow } = await admin
    .from("nanny_profiles")
    .select(
      "id, location_id, employment_type, live_arrangement_pref, availability, has_transportation, status, moderation_status, nanny_profile_languages(language_id), nanny_experience(age_group)",
    )
    .eq("id", nannyProfileId)
    .single();

  if (!nannyRow || nannyRow.status !== "active") return;

  const nannyInput: NannyMatchInput = {
    location: locationRefs.get(nannyRow.location_id as string) ?? {
      areaId: nannyRow.location_id as string,
      districtId: null,
      governorateId: null,
    },
    employmentType: nannyRow.employment_type as ScheduleType,
    liveArrangementPref: nannyRow.live_arrangement_pref as LiveArrangement,
    availabilityDays: (nannyRow.availability as { days: string[] })?.days ?? [],
    hasTransportation: nannyRow.has_transportation as boolean,
    languageIds: (nannyRow.nanny_profile_languages as { language_id: string }[]).map((l) => l.language_id),
    experienceAgeGroups: (nannyRow.nanny_experience as { age_group: string }[]).map((e) => e.age_group as AgeGroup),
  };

  const parents = await loadParentInputs(admin, locationRefs);
  const rows = parents.map(({ id, input }) => {
    const { score, breakdown } = computeMatchScore(input, nannyInput);
    return { parent_profile_id: id, nanny_profile_id: nannyProfileId, score, score_breakdown: breakdown };
  });

  await upsertMatches(admin, rows);
}
