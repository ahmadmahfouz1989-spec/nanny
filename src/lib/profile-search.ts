import en from "../../messages/en.json";
import ar from "../../messages/ar.json";

type Messages = Record<string, Record<string, unknown>>;
const LOCALES = [en, ar] as unknown as Messages[];

type Name = { name_en: string; name_ar: string; name_fr: string } | null | undefined;

/** A profile, as far as search needs it. */
export type SearchableProfile = {
  full_name: string;
  attributes: Record<string, unknown> | null;
  // A single joined row; typed loosely because PostgREST embeds can also
  // come back typed as an array.
  locations: Name | Name[];
  languages?: Name[];
};

// Tagged attribute -> the translation namespace holding its labels. Every
// tag is searchable by its English and Arabic label, whatever language the
// viewer is using.
const TAGGED: Record<string, string> = {
  certifications: "Certifications",
  careSpecialties: "CareSpecialties",
  careSpecialtiesNeeded: "CareSpecialties",
  subjects: "Subjects",
  subjectsNeeded: "Subjects",
  gradeLevel: "GradeLevels",
  gradeLevels: "GradeLevels",
  childrenAgeRanges: "AgeGroups",
  nationality: "Nationality",
  employmentType: "ScheduleOptions",
  scheduleType: "ScheduleOptions",
  liveArrangement: "LiveArrangementOptions",
  liveArrangementPref: "LiveArrangementOptions",
  format: "TutoringFormats",
  additionalDuties: "Duties",
  patientAgeGroup: "PatientAgeGroups",
};

// Free text the profile owner wrote for others to read. Private fields
// (license numbers, medical notes) are deliberately not listed, so search
// can never be used to probe them.
const FREE_TEXT = ["locationDetail", "shortIntro", "familyDescription", "additionalNotes"];

/** Lowercase, accent- and Arabic-diacritic-insensitive form for matching. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f\u064b-\u065f\u0670]/g, "")
    .toLowerCase();
}

function labels(namespace: string, code: string): string[] {
  return LOCALES.map((m) => m[namespace]?.[code]).filter((v): v is string => typeof v === "string");
}

function names(n: Name | Name[]): string[] {
  if (Array.isArray(n)) return n.flatMap(names);
  return n ? [n.name_en, n.name_ar, n.name_fr] : [];
}

/**
 * Everything a search can match on for one profile, already normalized --
 * what gets stored in generic_profiles.search_text.
 */
export function searchableText(profile: SearchableProfile): string {
  const a = profile.attributes ?? {};
  const parts: string[] = [profile.full_name, ...names(profile.locations)];
  for (const lang of profile.languages ?? []) parts.push(...names(lang));

  for (const key of FREE_TEXT) {
    if (typeof a[key] === "string") parts.push(a[key] as string);
  }
  for (const [key, namespace] of Object.entries(TAGGED)) {
    const value = a[key];
    const codes = Array.isArray(value) ? value : [value];
    for (const code of codes) {
      if (typeof code === "string") parts.push(code, ...labels(namespace, code));
    }
  }
  // Nanny experience is a list of { ageGroup, yearsExperience }.
  if (Array.isArray(a.experience)) {
    for (const e of a.experience as { ageGroup?: unknown }[]) {
      if (typeof e.ageGroup === "string") parts.push(...labels("AgeGroups", e.ageGroup));
    }
  }

  return normalizeForSearch(parts.join(" \u0001 "));
}

/**
 * A search query as the words the database compares against
 * generic_profiles.search_text (see list_profile_matches): every word has
 * to appear somewhere in it, and partial words count ("math" finds
 * "Mathematics").
 */
export function searchWords(query: string): string[] {
  return normalizeForSearch(query).split(/\s+/).filter(Boolean).slice(0, 10);
}

/** The same rule list_profile_matches applies, for code that has the profile in hand. */
export function matchesSearch(profile: SearchableProfile, query: string): boolean {
  const text = searchableText(profile);
  return searchWords(query).every((w) => text.includes(w));
}
