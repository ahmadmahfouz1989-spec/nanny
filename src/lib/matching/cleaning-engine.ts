// Weighted-rules matching for cleaning. Same shape as ./errands-engine.ts:
// the service decides a match at all, the district comes next. "When"
// depends on the request: a regular helper needs someone free on the days
// asked, a one-off "right now" needs someone who takes same-day jobs.
// "requirements" is what this particular job asks of the provider -- their
// own products, a sofa machine, a ladder for high windows, a team for a big
// or post-construction job, and a way to get there.

import { placeScore } from "./place";
import type { CleaningService, Frequency, ProviderType } from "@/lib/validation/cleaning";

export interface CleaningSeekerMatchInput {
  governorateId: string | null;
  districtId?: string | null;
  service: CleaningService | null;
  frequency: Frequency;
  timing: "asap" | "scheduled";
  /** Day of the week a one-off job is booked for (mon..sun), if scheduled. */
  scheduledDay: string | null;
  /** Days a regular helper is wanted on (empty: any). */
  neededDays: string[];
  size: string | null;
  highWindows: boolean;
  needsSupplies: boolean;
  canPickUp: boolean;
}

export interface CleaningProviderMatchInput {
  governorateId: string | null;
  districtId?: string | null;
  coverDistrictIds?: string[];
  services: string[];
  providerType: ProviderType | null;
  equipment: string[];
  bringsSupplies: boolean;
  transport: string | null;
  availabilityDays: string[];
  takesUrgentJobs: boolean;
}

export const CLEANING_CRITERIA_WEIGHTS = {
  service: 0.35,
  location: 0.25,
  availability: 0.2,
  requirements: 0.2,
} as const;

export type CleaningCriterion = keyof typeof CLEANING_CRITERIA_WEIGHTS;

export interface CriterionResult {
  raw: number;
  weighted: number;
  met: boolean;
}

export interface CleaningMatchResult {
  score: number;
  breakdown: Record<CleaningCriterion, CriterionResult>;
}

function availabilityScore(seeker: CleaningSeekerMatchInput, provider: CleaningProviderMatchInput): number {
  if (seeker.frequency !== "once") {
    // A regular helper: how many of the wanted days they can do.
    if (seeker.neededDays.length === 0) return 1;
    const covered = seeker.neededDays.filter((d) => provider.availabilityDays.includes(d)).length;
    return covered / seeker.neededDays.length;
  }
  if (seeker.timing === "asap") return provider.takesUrgentJobs ? 1 : 0;
  if (!seeker.scheduledDay) return 1;
  return provider.availabilityDays.includes(seeker.scheduledDay) ? 1 : 0;
}

/** The average of the checks this job needs; 1 when it needs nothing in particular. */
function requirementsScore(seeker: CleaningSeekerMatchInput, provider: CleaningProviderMatchInput): number {
  const checks: number[] = [];
  if (seeker.needsSupplies) checks.push(provider.bringsSupplies ? 1 : 0);
  if (seeker.service === "upholstery") checks.push(provider.equipment.includes("upholstery_machine") ? 1 : 0);
  if (seeker.service === "windows" && seeker.highWindows) checks.push(provider.equipment.includes("high_reach") ? 1 : 0);
  // After building work, or a big place: one person alone takes days.
  if (seeker.service === "construction" || seeker.size === "over_300") checks.push(provider.providerType === "individual" ? 0.5 : 1);
  // Someone who needs a lift is only a fit when the family can give one.
  if (provider.transport === "needs_pickup") checks.push(seeker.canPickUp ? 1 : 0);
  if (checks.length === 0) return 1;
  return checks.reduce((sum, c) => sum + c, 0) / checks.length;
}

export function computeCleaningMatchScore(seeker: CleaningSeekerMatchInput, provider: CleaningProviderMatchInput): CleaningMatchResult {
  const raw: Record<CleaningCriterion, number> = {
    service: seeker.service && provider.services.includes(seeker.service) ? 1 : 0,
    location: placeScore(seeker, provider),
    availability: availabilityScore(seeker, provider),
    requirements: requirementsScore(seeker, provider),
  };

  const breakdown = {} as Record<CleaningCriterion, CriterionResult>;
  let score = 0;

  for (const key of Object.keys(CLEANING_CRITERIA_WEIGHTS) as CleaningCriterion[]) {
    const weight = CLEANING_CRITERIA_WEIGHTS[key];
    const weighted = raw[key] * weight;
    score += weighted;
    breakdown[key] = { raw: raw[key], weighted, met: raw[key] >= 0.75 };
  }

  // A carpet washer is no match for a weekly home clean however close they
  // are -- without the service the pair scores 0.
  if (raw.service === 0) score = 0;

  return { score: Math.round(score * 10000) / 100, breakdown };
}
