// Weighted-rules matching engine (spec: docs/product-spec.md §4). Pure
// functions, no I/O — callers resolve profile/location/language data first.

export type ScheduleType = "full_time" | "part_time" | "either";
export type LiveArrangement = "live_in" | "live_out" | "either";
export type AgeGroup = "newborn" | "infant" | "toddler" | "preschool" | "school_age" | "teen";

export interface LocationRef {
  areaId: string;
  districtId: string | null;
  governorateId: string | null;
}

export interface ParentMatchInput {
  location: LocationRef;
  scheduleType: ScheduleType;
  liveArrangement: LiveArrangement;
  salaryMin: number;
  salaryMax: number;
  transportationRequired: boolean;
  childrenAgeRanges: AgeGroup[];
  languageIds: string[];
}

export interface NannyMatchInput {
  location: LocationRef;
  employmentType: ScheduleType;
  liveArrangementPref: LiveArrangement;
  availabilityDays: string[];
  expectedSalaryMin: number;
  expectedSalaryMax: number;
  hasTransportation: boolean;
  languageIds: string[];
  experienceAgeGroups: AgeGroup[];
}

export const CRITERIA_WEIGHTS = {
  location: 0.25,
  availability: 0.2,
  employmentType: 0.15,
  liveArrangement: 0.1,
  salary: 0.1,
  language: 0.08,
  childAgeExperience: 0.07,
  transportation: 0.05,
} as const;

export type Criterion = keyof typeof CRITERIA_WEIGHTS;

export interface CriterionResult {
  raw: number; // 0-1
  weighted: number; // 0-1 * weight
  met: boolean; // raw >= 0.75, for the ✓/✗ display (spec §4.4)
}

export interface MatchResult {
  score: number; // 0-100
  breakdown: Record<Criterion, CriterionResult>;
}

function locationScore(a: LocationRef, b: LocationRef): number {
  if (a.areaId === b.areaId) return 1;
  if (a.districtId && a.districtId === b.districtId) return 0.6;
  if (a.governorateId && a.governorateId === b.governorateId) return 0.3;
  return 0;
}

// Parents don't record specific required days in the MVP onboarding form —
// only a full/part/either preference — so availability is scored as the
// breadth of the nanny's stated days (a proxy for scheduling flexibility)
// rather than literal day-overlap against a parent-supplied day set.
function availabilityScore(nanny: NannyMatchInput): number {
  return Math.min(1, nanny.availabilityDays.length / 7);
}

function eitherMatch(a: string, b: string): number {
  if (a === "either" || b === "either") return 1;
  return a === b ? 1 : 0;
}

function salaryOverlapScore(parent: ParentMatchInput, nanny: NannyMatchInput): number {
  const overlap = Math.max(
    0,
    Math.min(parent.salaryMax, nanny.expectedSalaryMax) - Math.max(parent.salaryMin, nanny.expectedSalaryMin),
  );
  const union = Math.max(parent.salaryMax, nanny.expectedSalaryMax) - Math.min(parent.salaryMin, nanny.expectedSalaryMin);
  if (union <= 0) return 0;
  return overlap / union;
}

function languageScore(parent: ParentMatchInput, nanny: NannyMatchInput): number {
  if (parent.languageIds.length === 0) return 1;
  const nannySet = new Set(nanny.languageIds);
  const matched = parent.languageIds.filter((id) => nannySet.has(id)).length;
  return Math.min(1, matched / parent.languageIds.length);
}

function childAgeExperienceScore(parent: ParentMatchInput, nanny: NannyMatchInput): number {
  if (parent.childrenAgeRanges.length === 0) return 1;
  const nannySet = new Set(nanny.experienceAgeGroups);
  const matched = parent.childrenAgeRanges.filter((g) => nannySet.has(g)).length;
  return matched / parent.childrenAgeRanges.length;
}

function transportationScore(parent: ParentMatchInput, nanny: NannyMatchInput): number {
  if (!parent.transportationRequired) return 1;
  return nanny.hasTransportation ? 1 : 0;
}

export function computeMatchScore(parent: ParentMatchInput, nanny: NannyMatchInput): MatchResult {
  const raw: Record<Criterion, number> = {
    location: locationScore(parent.location, nanny.location),
    availability: availabilityScore(nanny),
    employmentType: eitherMatch(parent.scheduleType, nanny.employmentType),
    liveArrangement: eitherMatch(parent.liveArrangement, nanny.liveArrangementPref),
    salary: salaryOverlapScore(parent, nanny),
    language: languageScore(parent, nanny),
    childAgeExperience: childAgeExperienceScore(parent, nanny),
    transportation: transportationScore(parent, nanny),
  };

  const breakdown = {} as Record<Criterion, CriterionResult>;
  let score = 0;

  for (const key of Object.keys(CRITERIA_WEIGHTS) as Criterion[]) {
    const weight = CRITERIA_WEIGHTS[key];
    const weighted = raw[key] * weight;
    score += weighted;
    breakdown[key] = { raw: raw[key], weighted, met: raw[key] >= 0.75 };
  }

  return { score: Math.round(score * 10000) / 100, breakdown };
}
