import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeCareMatchScore,
  type CareProviderMatchInput,
  type CareSeekerMatchInput,
  type LiveArrangement,
  type ScheduleType,
} from "./generic-engine";

type Admin = ReturnType<typeof createAdminClient>;
type GenericProfileRow = {
  id: string;
  category_id: string;
  role: "seeker" | "provider";
  location_id: string | null;
  attributes: Record<string, unknown>;
  status: string;
  moderation_status: string;
};

const govRef = (locationId: string | null) => ({ governorateId: locationId });

// Only nursing exists today; a future category with a genuinely different
// rubric gets its own branch here (or its own input-builder pair) rather
// than forcing every category through the same criteria.
function seekerInputFromAttributes(profile: GenericProfileRow): CareSeekerMatchInput {
  const a = profile.attributes;
  return {
    location: govRef(profile.location_id),
    neededDays: (a.neededDays as string[]) ?? [],
    scheduleType: a.scheduleType as ScheduleType,
    liveArrangement: a.liveArrangement as LiveArrangement,
    transportationRequired: !!a.transportationRequired,
    careSpecialtiesNeeded: (a.careSpecialtiesNeeded as string[]) ?? [],
    languageIds: (a.languageIds as string[]) ?? [],
  };
}

function providerInputFromAttributes(profile: GenericProfileRow): CareProviderMatchInput {
  const a = profile.attributes;
  return {
    location: govRef(profile.location_id),
    employmentType: a.employmentType as ScheduleType,
    liveArrangementPref: a.liveArrangementPref as LiveArrangement,
    availabilityDays: (a.availability as { days?: string[] } | undefined)?.days ?? [],
    hasTransportation: !!a.hasTransportation,
    careSpecialties: (a.careSpecialties as string[]) ?? [],
    languageIds: (a.languageIds as string[]) ?? [],
  };
}

async function loadActiveApproved(admin: Admin, categoryId: string, role: "seeker" | "provider") {
  const { data } = await admin
    .from("generic_profiles")
    .select("id, category_id, role, location_id, attributes, status, moderation_status")
    .eq("category_id", categoryId)
    .eq("role", role)
    .eq("status", "active")
    .eq("moderation_status", "approved");
  return (data ?? []) as GenericProfileRow[];
}

async function upsertGenericMatches(
  admin: Admin,
  rows: { category_id: string; seeker_profile_id: string; provider_profile_id: string; score: number; score_breakdown: unknown }[],
) {
  if (rows.length === 0) return;
  await admin.from("generic_matches").upsert(rows, { onConflict: "seeker_profile_id,provider_profile_id" });
}

/**
 * Recomputes match scores between one generic_profiles row and every
 * active+approved profile of the opposite role in the same category. Scores
 * are computed as soon as a profile is active regardless of its own
 * moderation status (cross-visibility is gated by RLS/the API layer), so
 * scores are ready the moment it's approved -- same posture as
 * recomputeMatchesForParent/Nanny.
 */
export async function recomputeGenericMatchesForProfile(profileId: string) {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("generic_profiles")
    .select("id, category_id, role, location_id, attributes, status, moderation_status")
    .eq("id", profileId)
    .single();

  if (!profile || profile.status !== "active") return;
  const row = profile as GenericProfileRow;

  if (row.role === "seeker") {
    const seekerInput = seekerInputFromAttributes(row);
    const providers = await loadActiveApproved(admin, row.category_id, "provider");
    const rows = providers.map((p) => {
      const { score, breakdown } = computeCareMatchScore(seekerInput, providerInputFromAttributes(p));
      return {
        category_id: row.category_id,
        seeker_profile_id: row.id,
        provider_profile_id: p.id,
        score,
        score_breakdown: breakdown,
      };
    });
    await upsertGenericMatches(admin, rows);
    return;
  }

  const providerInput = providerInputFromAttributes(row);
  const seekers = await loadActiveApproved(admin, row.category_id, "seeker");
  const rows = seekers.map((s) => {
    const { score, breakdown } = computeCareMatchScore(seekerInputFromAttributes(s), providerInput);
    return {
      category_id: row.category_id,
      seeker_profile_id: s.id,
      provider_profile_id: row.id,
      score,
      score_breakdown: breakdown,
    };
  });
  await upsertGenericMatches(admin, rows);
}
