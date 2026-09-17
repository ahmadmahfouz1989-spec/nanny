// Weighted-rules matching for generic_profiles-based categories (nursing
// first). Same shape/spirit as ./engine.ts (pure functions, 0-1 criteria
// scores, weighted 0-100 total), but nursing's domain doesn't map cleanly
// onto ParentMatchInput/NannyMatchInput -- there's no "children age ranges"
// concept, and forcing patient age group into that enum would make the
// childAgeExperience criterion meaningless. Instead this replaces it with a
// care-specialty overlap criterion, which is the actual matching signal for
// nursing (e.g. "post_surgical" seeker vs "post_surgical" provider).

export type ScheduleType = "full_time" | "part_time" | "either";
export type LiveArrangement = "live_in" | "live_out" | "either";

export interface LocationRef {
  governorateId: string | null;
}

export interface CareSeekerMatchInput {
  location: LocationRef;
  neededDays: string[];
  scheduleType: ScheduleType;
  liveArrangement: LiveArrangement;
  transportationRequired: boolean;
  careSpecialtiesNeeded: string[];
  languageIds: string[];
}

export interface CareProviderMatchInput {
  location: LocationRef;
  employmentType: ScheduleType;
  liveArrangementPref: LiveArrangement;
  availabilityDays: string[];
  hasTransportation: boolean;
  careSpecialties: string[];
  languageIds: string[];
}

export const CARE_CRITERIA_WEIGHTS = {
  location: 0.3,
  availability: 0.25,
  employmentType: 0.15,
  liveArrangement: 0.1,
  language: 0.08,
  specialty: 0.07,
  transportation: 0.05,
} as const;

export type CareCriterion = keyof typeof CARE_CRITERIA_WEIGHTS;

export interface CriterionResult {
  raw: number;
  weighted: number;
  met: boolean;
}

export interface CareMatchResult {
  score: number;
  breakdown: Record<CareCriterion, CriterionResult>;
}

function locationScore(a: LocationRef, b: LocationRef): number {
  return a.governorateId && a.governorateId === b.governorateId ? 1 : 0;
}

function availabilityScore(seeker: CareSeekerMatchInput, provider: CareProviderMatchInput): number {
  if (seeker.neededDays.length === 0) {
    return Math.min(1, provider.availabilityDays.length / 7);
  }
  const have = new Set(provider.availabilityDays);
  const covered = seeker.neededDays.filter((d) => have.has(d)).length;
  return covered / seeker.neededDays.length;
}

function eitherMatch(a: string, b: string): number {
  if (a === "either" || b === "either") return 1;
  return a === b ? 1 : 0;
}

function languageScore(seeker: CareSeekerMatchInput, provider: CareProviderMatchInput): number {
  if (seeker.languageIds.length === 0) return 1;
  const providerSet = new Set(provider.languageIds);
  const matched = seeker.languageIds.filter((id) => providerSet.has(id)).length;
  return Math.min(1, matched / seeker.languageIds.length);
}

function specialtyScore(seeker: CareSeekerMatchInput, provider: CareProviderMatchInput): number {
  if (seeker.careSpecialtiesNeeded.length === 0) return 1;
  const providerSet = new Set(provider.careSpecialties);
  const matched = seeker.careSpecialtiesNeeded.filter((s) => providerSet.has(s)).length;
  return matched / seeker.careSpecialtiesNeeded.length;
}

function transportationScore(seeker: CareSeekerMatchInput, provider: CareProviderMatchInput): number {
  if (!seeker.transportationRequired) return 1;
  return provider.hasTransportation ? 1 : 0;
}

export function computeCareMatchScore(
  seeker: CareSeekerMatchInput,
  provider: CareProviderMatchInput,
): CareMatchResult {
  const raw: Record<CareCriterion, number> = {
    location: locationScore(seeker.location, provider.location),
    availability: availabilityScore(seeker, provider),
    employmentType: eitherMatch(seeker.scheduleType, provider.employmentType),
    liveArrangement: eitherMatch(seeker.liveArrangement, provider.liveArrangementPref),
    language: languageScore(seeker, provider),
    specialty: specialtyScore(seeker, provider),
    transportation: transportationScore(seeker, provider),
  };

  const breakdown = {} as Record<CareCriterion, CriterionResult>;
  let score = 0;

  for (const key of Object.keys(CARE_CRITERIA_WEIGHTS) as CareCriterion[]) {
    const weight = CARE_CRITERIA_WEIGHTS[key];
    const weighted = raw[key] * weight;
    score += weighted;
    breakdown[key] = { raw: raw[key], weighted, met: raw[key] >= 0.75 };
  }

  return { score: Math.round(score * 10000) / 100, breakdown };
}
