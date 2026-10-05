// Weighted-rules matching for the home maintenance category. Same shape as
// ./tutoring-engine.ts, but the rubric is its own: the trade is what
// decides a match at all, a provider can cover several governorates, and
// an urgent job needs someone who takes urgent jobs rather than someone
// free on particular days.

export type Urgency = "urgent" | "this_week" | "flexible";

export interface MaintenanceSeekerMatchInput {
  governorateId: string | null;
  tradesNeeded: string[];
  urgency: Urgency;
  neededDays: string[];
}

export interface MaintenanceProviderMatchInput {
  governorateId: string | null;
  serviceAreaIds: string[];
  trades: string[];
  availabilityDays: string[];
  takesUrgentJobs: boolean;
  yearsExperience: number;
}

export const MAINTENANCE_CRITERIA_WEIGHTS = {
  trade: 0.4,
  location: 0.25,
  availability: 0.2,
  experience: 0.15,
} as const;

export type MaintenanceCriterion = keyof typeof MAINTENANCE_CRITERIA_WEIGHTS;

export interface CriterionResult {
  raw: number;
  weighted: number;
  met: boolean;
}

export interface MaintenanceMatchResult {
  score: number;
  breakdown: Record<MaintenanceCriterion, CriterionResult>;
}

// Years at which experience counts as full marks.
const FULL_EXPERIENCE_YEARS = 5;

function tradeScore(seeker: MaintenanceSeekerMatchInput, provider: MaintenanceProviderMatchInput): number {
  if (seeker.tradesNeeded.length === 0) return 0;
  const have = new Set(provider.trades);
  return seeker.tradesNeeded.filter((t) => have.has(t)).length / seeker.tradesNeeded.length;
}

function locationScore(seeker: MaintenanceSeekerMatchInput, provider: MaintenanceProviderMatchInput): number {
  if (!seeker.governorateId) return 0;
  if (seeker.governorateId === provider.governorateId) return 1;
  return provider.serviceAreaIds.includes(seeker.governorateId) ? 1 : 0;
}

function availabilityScore(seeker: MaintenanceSeekerMatchInput, provider: MaintenanceProviderMatchInput): number {
  // An urgent job is about turning up now, not about a weekly schedule.
  if (seeker.urgency === "urgent") return provider.takesUrgentJobs ? 1 : 0;
  if (seeker.neededDays.length === 0) return 1;
  const have = new Set(provider.availabilityDays);
  return seeker.neededDays.filter((d) => have.has(d)).length / seeker.neededDays.length;
}

function experienceScore(provider: MaintenanceProviderMatchInput): number {
  return Math.min(1, Math.max(0, provider.yearsExperience) / FULL_EXPERIENCE_YEARS);
}

export function computeMaintenanceMatchScore(
  seeker: MaintenanceSeekerMatchInput,
  provider: MaintenanceProviderMatchInput,
): MaintenanceMatchResult {
  const raw: Record<MaintenanceCriterion, number> = {
    trade: tradeScore(seeker, provider),
    location: locationScore(seeker, provider),
    availability: availabilityScore(seeker, provider),
    experience: experienceScore(provider),
  };

  const breakdown = {} as Record<MaintenanceCriterion, CriterionResult>;
  let score = 0;

  for (const key of Object.keys(MAINTENANCE_CRITERIA_WEIGHTS) as MaintenanceCriterion[]) {
    const weight = MAINTENANCE_CRITERIA_WEIGHTS[key];
    const weighted = raw[key] * weight;
    score += weighted;
    breakdown[key] = { raw: raw[key], weighted, met: raw[key] >= 0.75 };
  }

  // A plumber is no match for a painting job however close or available
  // they are -- without any trade in common the pair scores 0 and sinks to
  // the bottom of the list.
  if (raw.trade === 0) score = 0;

  return { score: Math.round(score * 10000) / 100, breakdown };
}
