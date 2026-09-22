// Weighted-rules matching for the tutoring category. Same shape/spirit as
// ./generic-engine.ts (nursing) and ./engine.ts (nanny), but tutoring's
// rubric genuinely diverges from nursing's -- there's no "live arrangement"
// concept for a tutor, and "specialty" becomes subject/grade-level overlap
// -- so this is its own small engine rather than forcing tutoring through
// generic-engine's CareSeekerMatchInput/CareProviderMatchInput shape.

export type TutoringFormat = "online" | "in_person" | "either";

export interface LocationRef {
  governorateId: string | null;
}

export interface TutoringSeekerMatchInput {
  location: LocationRef;
  neededDays: string[];
  format: TutoringFormat;
  transportationRequired: boolean;
  subjectsNeeded: string[];
  gradeLevel: string;
  languageIds: string[];
}

export interface TutoringProviderMatchInput {
  location: LocationRef;
  availabilityDays: string[];
  format: TutoringFormat;
  hasTransportation: boolean;
  subjects: string[];
  gradeLevels: string[];
  languageIds: string[];
}

export const TUTORING_CRITERIA_WEIGHTS = {
  location: 0.2,
  availability: 0.25,
  format: 0.15,
  subject: 0.2,
  gradeLevel: 0.1,
  language: 0.1,
} as const;

export type TutoringCriterion = keyof typeof TUTORING_CRITERIA_WEIGHTS;

export interface CriterionResult {
  raw: number;
  weighted: number;
  met: boolean;
}

export interface TutoringMatchResult {
  score: number;
  breakdown: Record<TutoringCriterion, CriterionResult>;
}

function locationScore(a: LocationRef, b: LocationRef): number {
  return a.governorateId && a.governorateId === b.governorateId ? 1 : 0;
}

function availabilityScore(seeker: TutoringSeekerMatchInput, provider: TutoringProviderMatchInput): number {
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

function languageScore(seeker: TutoringSeekerMatchInput, provider: TutoringProviderMatchInput): number {
  if (seeker.languageIds.length === 0) return 1;
  const providerSet = new Set(provider.languageIds);
  const matched = seeker.languageIds.filter((id) => providerSet.has(id)).length;
  return Math.min(1, matched / seeker.languageIds.length);
}

function subjectScore(seeker: TutoringSeekerMatchInput, provider: TutoringProviderMatchInput): number {
  if (seeker.subjectsNeeded.length === 0) return 1;
  const providerSet = new Set(provider.subjects);
  const matched = seeker.subjectsNeeded.filter((s) => providerSet.has(s)).length;
  return matched / seeker.subjectsNeeded.length;
}

function gradeLevelScore(seeker: TutoringSeekerMatchInput, provider: TutoringProviderMatchInput): number {
  return provider.gradeLevels.includes(seeker.gradeLevel) ? 1 : 0;
}

// True only when the session can't just happen online -- if either side
// is strictly "in_person", the other side (whatever it prefers) ends up
// travelling or hosting in person; if neither is strictly "in_person",
// an online session is always an option and no one needs transportation.
// A mismatched pairing (one "online", one "in_person") reads as
// "in person" here too, but that's moot: eitherMatch already scores that
// combination's format as 0, so multiplying by any transportation score
// still leaves the format criterion at 0.
function requiresInPerson(seeker: TutoringFormat, provider: TutoringFormat): boolean {
  return seeker === "in_person" || provider === "in_person";
}

function transportationScore(
  seeker: TutoringSeekerMatchInput,
  provider: TutoringProviderMatchInput,
  inPerson: boolean,
): number {
  if (!inPerson || !seeker.transportationRequired) return 1;
  return provider.hasTransportation ? 1 : 0;
}

export function computeTutoringMatchScore(
  seeker: TutoringSeekerMatchInput,
  provider: TutoringProviderMatchInput,
): TutoringMatchResult {
  // Transportation only matters for in-person tutoring, but there's no
  // dedicated weight slot for it -- fold it into the format score instead
  // of adding a 7th criterion just for this one case.
  const inPerson = requiresInPerson(seeker.format, provider.format);
  const formatRaw = eitherMatch(seeker.format, provider.format) * transportationScore(seeker, provider, inPerson);

  const raw: Record<TutoringCriterion, number> = {
    location: locationScore(seeker.location, provider.location),
    availability: availabilityScore(seeker, provider),
    format: formatRaw,
    subject: subjectScore(seeker, provider),
    gradeLevel: gradeLevelScore(seeker, provider),
    language: languageScore(seeker, provider),
  };

  const breakdown = {} as Record<TutoringCriterion, CriterionResult>;
  let score = 0;

  for (const key of Object.keys(TUTORING_CRITERIA_WEIGHTS) as TutoringCriterion[]) {
    const weight = TUTORING_CRITERIA_WEIGHTS[key];
    const weighted = raw[key] * weight;
    score += weighted;
    breakdown[key] = { raw: raw[key], weighted, met: raw[key] >= 0.75 };
  }

  return { score: Math.round(score * 10000) / 100, breakdown };
}
