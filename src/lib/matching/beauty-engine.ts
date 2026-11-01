// Weighted-rules matching for beauty & wellness. Same shape as
// ./cleaning-engine.ts. Some things decide a match at all: the service,
// where it happens (a home visit needs someone who visits), who it's for
// (a women-only beautician doesn't take men), and a stated preference for
// a woman or a man. "requirements" is how well they fit this request --
// the treatments asked for, and a team for a big group.

import { placeScore } from "./place";
import type { BeautyProviderType, BeautyService, ForWhom, Gender, GenderPreference, Place } from "@/lib/validation/beauty";
import { TREATMENTS, servesFor } from "@/lib/validation/beauty";

export interface BeautySeekerMatchInput {
  governorateId: string | null;
  districtId?: string | null;
  service: BeautyService | null;
  treatments: string[];
  place: Place;
  forWhom: ForWhom;
  providerGender: GenderPreference;
  peopleCount: number;
  timing: "asap" | "scheduled";
  /** Day of the week booked for (mon..sun), if scheduled. */
  scheduledDay: string | null;
}

export interface BeautyProviderMatchInput {
  governorateId: string | null;
  districtId?: string | null;
  coverDistrictIds?: string[];
  services: string[];
  treatments: string[];
  workplaces: string[];
  serves: string[];
  gender: Gender | null;
  providerType: BeautyProviderType | null;
  availabilityDays: string[];
  takesUrgentJobs: boolean;
}

export const BEAUTY_CRITERIA_WEIGHTS = {
  service: 0.3,
  location: 0.25,
  availability: 0.2,
  requirements: 0.25,
} as const;

export type BeautyCriterion = keyof typeof BEAUTY_CRITERIA_WEIGHTS;

export interface CriterionResult {
  raw: number;
  weighted: number;
  met: boolean;
}

export interface BeautyMatchResult {
  score: number;
  breakdown: Record<BeautyCriterion, CriterionResult>;
}

/** Whether the two can meet where the client wants: at home, at the provider's, or either. */
function placeFits(seeker: BeautySeekerMatchInput, provider: BeautyProviderMatchInput): boolean {
  const visits = provider.workplaces.includes("client_home");
  const hosts = provider.workplaces.includes("own_place") || provider.workplaces.includes("salon");
  if (seeker.place === "at_home") return visits;
  if (seeker.place === "go_to_them") return hosts;
  return visits || hosts;
}

/** 1 for the gender asked for, 0.75 for a mixed team or salon, 0 for the other. */
function genderScore(seeker: BeautySeekerMatchInput, provider: BeautyProviderMatchInput): number {
  if (seeker.providerGender === "any") return 1;
  if (provider.gender === "mixed") return 0.75;
  return provider.gender === seeker.providerGender ? 1 : 0;
}

function availabilityScore(seeker: BeautySeekerMatchInput, provider: BeautyProviderMatchInput): number {
  if (seeker.timing === "asap") return provider.takesUrgentJobs ? 1 : 0;
  if (!seeker.scheduledDay) return 1;
  return provider.availabilityDays.includes(seeker.scheduledDay) ? 1 : 0;
}

/** The average of the checks this request needs; 1 when it needs nothing in particular. */
function requirementsScore(seeker: BeautySeekerMatchInput, provider: BeautyProviderMatchInput): number {
  const checks: number[] = [];
  if (seeker.service && seeker.treatments.length > 0) {
    // Someone who ticked none of the service's treatments probably does
    // the usual ones -- likely, not certain.
    const ofService = TREATMENTS[seeker.service];
    const listsAny = provider.treatments.some((t) => ofService.includes(t));
    const offered = seeker.treatments.filter((t) => provider.treatments.includes(t)).length;
    checks.push(listsAny ? offered / seeker.treatments.length : 0.75);
  }
  if (seeker.providerGender !== "any") checks.push(genderScore(seeker, provider));
  // A bride and five bridesmaids before noon: one person alone is a stretch.
  if (seeker.peopleCount >= 4) checks.push(provider.providerType === "individual" ? 0.5 : 1);
  if (checks.length === 0) return 1;
  return checks.reduce((sum, c) => sum + c, 0) / checks.length;
}

export function computeBeautyMatchScore(seeker: BeautySeekerMatchInput, provider: BeautyProviderMatchInput): BeautyMatchResult {
  // When the client goes to them, the districts they travel to don't matter.
  const where = seeker.place === "go_to_them" ? { ...provider, coverDistrictIds: [] } : provider;
  const raw: Record<BeautyCriterion, number> = {
    service: seeker.service && provider.services.includes(seeker.service) ? 1 : 0,
    location: placeScore(seeker, where),
    availability: availabilityScore(seeker, provider),
    requirements: requirementsScore(seeker, provider),
  };

  const breakdown = {} as Record<BeautyCriterion, CriterionResult>;
  let score = 0;

  for (const key of Object.keys(BEAUTY_CRITERIA_WEIGHTS) as BeautyCriterion[]) {
    const weight = BEAUTY_CRITERIA_WEIGHTS[key];
    const weighted = raw[key] * weight;
    score += weighted;
    breakdown[key] = { raw: raw[key], weighted, met: raw[key] >= 0.75 };
  }

  const blocked =
    raw.service === 0 ||
    !placeFits(seeker, provider) ||
    !provider.serves.includes(servesFor(seeker.forWhom)) ||
    genderScore(seeker, provider) === 0;
  if (blocked) score = 0;

  return { score: Math.round(score * 10000) / 100, breakdown };
}
