import { createAdminClient } from "@/lib/supabase/admin";
import {
  computeCareMatchScore,
  type CareProviderMatchInput,
  type CareSeekerMatchInput,
  type LiveArrangement,
  type ScheduleType,
} from "./generic-engine";
import { computeMatchScore as computeNannyMatchScore, nannyInputFromProfile, parentInputFromProfile } from "./engine";
import {
  computeTutoringMatchScore,
  type TutoringFormat,
  type TutoringProviderMatchInput,
  type TutoringSeekerMatchInput,
} from "./tutoring-engine";

type Admin = ReturnType<typeof createAdminClient>;
type GenericProfileRow = {
  id: string;
  user_id: string;
  category_id: string;
  role: "seeker" | "provider";
  location_id: string | null;
  attributes: Record<string, unknown>;
  status: string;
  moderation_status: string;
};

const govRef = (locationId: string | null) => ({ governorateId: locationId });

// Each category with a genuinely different rubric gets its own
// input-builder pair + scoring function, rather than forcing every
// category through the same criteria (see generic-engine.ts vs
// tutoring-engine.ts for why nursing and tutoring don't share one).
function nursingSeekerInput(profile: GenericProfileRow): CareSeekerMatchInput {
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

function nursingProviderInput(profile: GenericProfileRow): CareProviderMatchInput {
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

function tutoringSeekerInput(profile: GenericProfileRow): TutoringSeekerMatchInput {
  const a = profile.attributes;
  return {
    location: govRef(profile.location_id),
    neededDays: (a.neededDays as string[]) ?? [],
    format: a.format as TutoringFormat,
    transportationRequired: !!a.transportationRequired,
    subjectsNeeded: (a.subjectsNeeded as string[]) ?? [],
    gradeLevel: (a.gradeLevel as string) ?? "",
    languageIds: (a.languageIds as string[]) ?? [],
  };
}

function tutoringProviderInput(profile: GenericProfileRow): TutoringProviderMatchInput {
  const a = profile.attributes;
  return {
    location: govRef(profile.location_id),
    availabilityDays: (a.availability as { days?: string[] } | undefined)?.days ?? [],
    format: a.format as TutoringFormat,
    hasTransportation: !!a.hasTransportation,
    subjects: (a.subjects as string[]) ?? [],
    gradeLevels: (a.gradeLevels as string[]) ?? [],
    languageIds: (a.languageIds as string[]) ?? [],
  };
}

function scoreFor(categorySlug: string, seeker: GenericProfileRow, provider: GenericProfileRow) {
  if (categorySlug === "nanny") {
    return computeNannyMatchScore(parentInputFromProfile(seeker), nannyInputFromProfile(provider));
  }
  if (categorySlug === "tutoring") {
    return computeTutoringMatchScore(tutoringSeekerInput(seeker), tutoringProviderInput(provider));
  }
  // nursing is the default/fallback -- the only other category wired up
  // when this was written. A third category needs its own branch here.
  return computeCareMatchScore(nursingSeekerInput(seeker), nursingProviderInput(provider));
}

async function loadActiveApproved(admin: Admin, categoryId: string, role: "seeker" | "provider") {
  const { data } = await admin
    .from("generic_profiles")
    .select("id, user_id, category_id, role, location_id, attributes, status, moderation_status")
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
 * scores are ready the moment it's approved.
 */
export async function recomputeGenericMatchesForProfile(profileId: string) {
  const admin = createAdminClient();

  const { data: profile } = await admin
    .from("generic_profiles")
    .select("id, user_id, category_id, role, location_id, attributes, status, moderation_status, categories(slug)")
    .eq("id", profileId)
    .single();

  if (!profile || profile.status !== "active") return;
  const row = profile as GenericProfileRow;
  const categorySlug = (profile.categories as unknown as { slug: string } | null)?.slug ?? "";

  if (row.role === "seeker") {
    // Exclude the same account's own provider profile in this category --
    // one user_id can hold both roles (e.g. tutors who also seek a tutor
    // for their own kid), and nothing about "opposite role, same
    // category" should include matching with yourself.
    const providers = (await loadActiveApproved(admin, row.category_id, "provider")).filter(
      (p) => p.user_id !== row.user_id,
    );
    const rows = providers.map((p) => {
      const { score, breakdown } = scoreFor(categorySlug, row, p);
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

  const seekers = (await loadActiveApproved(admin, row.category_id, "seeker")).filter((s) => s.user_id !== row.user_id);
  const rows = seekers.map((s) => {
    const { score, breakdown } = scoreFor(categorySlug, s, row);
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
