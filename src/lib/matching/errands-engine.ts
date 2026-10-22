// Weighted-rules matching for delivery & errands. Same shape as
// ./maintenance-engine.ts: the service decides a match at all, a provider
// can cover several governorates, and a "right now" request needs someone
// who takes urgent jobs rather than someone free on a particular day.
// "requirements" is what the particular service asks of the provider --
// standing in a queue long enough, paying for the shopping, a licensed
// rider for a moto taxi.

import type { ErrandService } from "@/lib/validation/errands";

export interface ErrandSeekerMatchInput {
  governorateId: string | null;
  service: ErrandService | null;
  timing: "asap" | "scheduled";
  /** Day of the week the errand is booked for (mon..sun), if scheduled. */
  scheduledDay: string | null;
  expectedWaitHours: number | null;
  budgetUsd: number | null;
}

export interface ErrandProviderMatchInput {
  governorateId: string | null;
  serviceAreaIds: string[];
  services: string[];
  availabilityDays: string[];
  takesUrgentJobs: boolean;
  maxWaitHours: number | null;
  canPayForPurchases: boolean;
  hasDrivingLicense: boolean;
  hasInsurance: boolean;
}

export const ERRANDS_CRITERIA_WEIGHTS = {
  service: 0.4,
  location: 0.3,
  availability: 0.2,
  requirements: 0.1,
} as const;

export type ErrandsCriterion = keyof typeof ERRANDS_CRITERIA_WEIGHTS;

export interface CriterionResult {
  raw: number;
  weighted: number;
  met: boolean;
}

export interface ErrandsMatchResult {
  score: number;
  breakdown: Record<ErrandsCriterion, CriterionResult>;
}

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/** "2026-10-24T09:30" -> "sat". Read as written (local time), not shifted through UTC. */
export function dayOfWeek(dateTime: string | undefined | null): string | null {
  const m = dateTime?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return DAY_KEYS[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()];
}

function locationScore(seeker: ErrandSeekerMatchInput, provider: ErrandProviderMatchInput): number {
  if (!seeker.governorateId) return 0;
  if (seeker.governorateId === provider.governorateId) return 1;
  return provider.serviceAreaIds.includes(seeker.governorateId) ? 1 : 0;
}

function availabilityScore(seeker: ErrandSeekerMatchInput, provider: ErrandProviderMatchInput): number {
  if (seeker.timing === "asap") return provider.takesUrgentJobs ? 1 : 0;
  if (!seeker.scheduledDay) return 1;
  return provider.availabilityDays.includes(seeker.scheduledDay) ? 1 : 0;
}

function requirementsScore(seeker: ErrandSeekerMatchInput, provider: ErrandProviderMatchInput): number {
  switch (seeker.service) {
    case "queue":
      if (seeker.expectedWaitHours === null || provider.maxWaitHours === null) return 1;
      return provider.maxWaitHours >= seeker.expectedWaitHours ? 1 : 0;
    case "shopping":
      // Someone who pays up front saves the customer a trip to hand over cash.
      return provider.canPayForPurchases ? 1 : 0.5;
    case "moto_taxi":
      return (provider.hasDrivingLicense ? 0.5 : 0) + (provider.hasInsurance ? 0.5 : 0);
    default:
      return 1;
  }
}

export function computeErrandsMatchScore(seeker: ErrandSeekerMatchInput, provider: ErrandProviderMatchInput): ErrandsMatchResult {
  const raw: Record<ErrandsCriterion, number> = {
    service: seeker.service && provider.services.includes(seeker.service) ? 1 : 0,
    location: locationScore(seeker, provider),
    availability: availabilityScore(seeker, provider),
    requirements: requirementsScore(seeker, provider),
  };

  const breakdown = {} as Record<ErrandsCriterion, CriterionResult>;
  let score = 0;

  for (const key of Object.keys(ERRANDS_CRITERIA_WEIGHTS) as ErrandsCriterion[]) {
    const weight = ERRANDS_CRITERIA_WEIGHTS[key];
    const weighted = raw[key] * weight;
    score += weighted;
    breakdown[key] = { raw: raw[key], weighted, met: raw[key] >= 0.75 };
  }

  // Someone who only does paperwork is no match for a moto taxi ride
  // however close they are -- without the service the pair scores 0.
  if (raw.service === 0) score = 0;

  return { score: Math.round(score * 10000) / 100, breakdown };
}
