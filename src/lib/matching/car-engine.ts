// Weighted-rules matching for car services. Same shape as
// ./beauty-engine.ts. The service and where the work happens decide a
// match at all (a garage-only mechanic can't fix a car stuck in Jounieh);
// towing and roadside help are always where the car is. "requirements" is
// whether they work on this car -- its make, and diesel, hybrid or electric.

import { placeScore } from "./place";
import { FUEL_MATTERS, ON_THE_SPOT, type CarPlace, type CarService, type CarTiming, type Fuel } from "@/lib/validation/car";

export interface CarSeekerMatchInput {
  governorateId: string | null;
  districtId?: string | null;
  service: CarService | null;
  place: CarPlace;
  make: string | null;
  fuel: Fuel;
  timing: CarTiming;
  /** Day of the week booked for (mon..sun), if scheduled. */
  scheduledDay: string | null;
}

export interface CarProviderMatchInput {
  governorateId: string | null;
  districtId?: string | null;
  coverDistrictIds?: string[];
  services: string[];
  workplaces: string[];
  /** Empty: all makes. */
  makes: string[];
  fuels: string[];
  emergency24h: boolean;
  availabilityDays: string[];
  takesUrgentJobs: boolean;
}

export const CAR_CRITERIA_WEIGHTS = {
  service: 0.3,
  location: 0.3,
  availability: 0.2,
  requirements: 0.2,
} as const;

export type CarCriterion = keyof typeof CAR_CRITERIA_WEIGHTS;

export interface CriterionResult {
  raw: number;
  weighted: number;
  met: boolean;
}

export interface CarMatchResult {
  score: number;
  breakdown: Record<CarCriterion, CriterionResult>;
}

/** The place the client picked, or "where the car is" for towing and roadside help. */
function placeOf(seeker: CarSeekerMatchInput): CarPlace {
  return seeker.service && ON_THE_SPOT.includes(seeker.service) ? "at_location" : seeker.place;
}

function placeFits(seeker: CarSeekerMatchInput, provider: CarProviderMatchInput): boolean {
  // Offering towing or roadside help means going to the car.
  if (seeker.service && ON_THE_SPOT.includes(seeker.service)) return true;
  const place = placeOf(seeker);
  if (place === "at_location") return provider.workplaces.includes("mobile");
  if (place === "bring_to_them") return provider.workplaces.includes("garage");
  if (place === "pickup") return provider.workplaces.includes("pickup");
  return provider.workplaces.length > 0;
}

function availabilityScore(seeker: CarSeekerMatchInput, provider: CarProviderMatchInput): number {
  // Stuck right now: someone on call around the clock, or at least today.
  if (seeker.timing === "emergency") return provider.emergency24h ? 1 : provider.takesUrgentJobs ? 0.5 : 0;
  if (seeker.timing === "asap") return provider.takesUrgentJobs || provider.emergency24h ? 1 : 0;
  if (!seeker.scheduledDay) return 1;
  return provider.availabilityDays.includes(seeker.scheduledDay) ? 1 : 0;
}

/** The average of the checks this car needs; 1 when it needs nothing in particular. */
function requirementsScore(seeker: CarSeekerMatchInput, provider: CarProviderMatchInput): number {
  const checks: number[] = [];
  // A specialist in other makes might still do it; no list means all makes.
  if (seeker.make && seeker.make !== "other" && provider.makes.length > 0) {
    checks.push(provider.makes.includes(seeker.make) ? 1 : 0.5);
  }
  if (seeker.fuel !== "petrol" && seeker.service && FUEL_MATTERS.includes(seeker.service)) {
    checks.push(provider.fuels.includes(seeker.fuel) ? 1 : 0);
  }
  if (checks.length === 0) return 1;
  return checks.reduce((sum, c) => sum + c, 0) / checks.length;
}

export function computeCarMatchScore(seeker: CarSeekerMatchInput, provider: CarProviderMatchInput): CarMatchResult {
  // When the car is driven to their garage, the districts they travel to don't matter.
  const where = placeOf(seeker) === "bring_to_them" ? { ...provider, coverDistrictIds: [] } : provider;
  const raw: Record<CarCriterion, number> = {
    service: seeker.service && provider.services.includes(seeker.service) ? 1 : 0,
    location: placeScore(seeker, where),
    availability: availabilityScore(seeker, provider),
    requirements: requirementsScore(seeker, provider),
  };

  const breakdown = {} as Record<CarCriterion, CriterionResult>;
  let score = 0;

  for (const key of Object.keys(CAR_CRITERIA_WEIGHTS) as CarCriterion[]) {
    const weight = CAR_CRITERIA_WEIGHTS[key];
    const weighted = raw[key] * weight;
    score += weighted;
    breakdown[key] = { raw: raw[key], weighted, met: raw[key] >= 0.75 };
  }

  if (raw.service === 0 || !placeFits(seeker, provider)) score = 0;

  return { score: Math.round(score * 10000) / 100, breakdown };
}
