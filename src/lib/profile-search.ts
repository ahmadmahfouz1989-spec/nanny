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
  trades: "Trades",
  tradesNeeded: "Trades",
  urgency: "Urgency",
  errandServices: "ErrandServices",
  errandService: "ErrandServices",
  cleaningServices: "CleaningServices",
  cleaningService: "CleaningServices",
  beautyServices: "BeautyServices",
  beautyService: "BeautyServices",
  treatments: "BeautyTreatments",
  carServices: "CarServices",
  carService: "CarServices",
  issues: "CarIssues",
  carMake: "CarMakes",
  makes: "CarMakes",
  vehicle: "Vehicles",
  additionalDuties: "Duties",
  patientAgeGroup: "PatientAgeGroups",
};

// Free text the profile owner wrote for others to read. Private fields
// (license numbers, medical notes) are deliberately not listed, so search
// can never be used to probe them.
const FREE_TEXT = ["locationDetail", "shortIntro", "familyDescription", "additionalNotes", "jobDescription", "paperworkTypes", "priceNote"];

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
  // Cleaning goes by many everyday names ("تنضيف", "شغالة", "ménage").
  if (a.cleaningServices !== undefined || a.cleaningService !== undefined) parts.push(...labels("CleaningServices", "searchWords"));
  if (a.beautyServices !== undefined || a.beautyService !== undefined) parts.push(...labels("BeautyServices", "searchWords"));
  if (a.carServices !== undefined || a.carService !== undefined) parts.push(...labels("CarServices", "searchWords"));
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

// Everyday words for the same thing, each pointing at a word every
// matching profile's search text already contains (the English label is
// always stored). People type كهربائي or كهربا, the label says كهربجي;
// they type سنكري, it says سبّاك.
const SYNONYM_GROUPS: [canonical: string, words: string[]][] = [
  ["electrician", ["كهربائي", "كهربايي", "كهربا", "كهرباء", "كهربجي", "electric", "electrical", "electricien"]],
  ["plumber", ["سباك", "سنكري", "سمكري", "سنكرية", "plumbing", "plombier"]],
  ["painter", ["دهان", "بويجي", "دهين", "painting", "peintre"]],
  ["tiler", ["بلاط", "بليط", "تبليط", "tiles", "tiling", "carreleur"]],
  ["carpenter", ["نجار", "نجارة", "carpentry", "menuisier"]],
  // Appliance repair: pointed at the Arabic label each profile stores.
  ["براد", ["تلاجه", "تلاجة", "ثلاجه", "ثلاجة", "فريزر", "fridge", "refrigerator", "freezer", "frigo", "réfrigérateur"]],
  ["غسال", ["غساله", "غسالة", "غسيل", "washer", "laundry", "lave-linge"]],
  ["مكيف", ["مكيفات", "مكيّف", "تكييف", "مكيفه", "سبليت", "aircon", "conditioner", "conditioning", "climatisation", "clim", "split"]],
  ["nanny", ["مربيه", "داده", "دادا", "جليسه", "جليسة", "babysitter", "baby-sitter", "nounou"]],
  ["nurs", ["ممرضه", "ممرض", "ممرضة", "تمريض", "infirmier", "infirmiere"]],
  ["tutor", ["استاذ", "أستاذ", "معلم", "معلمه", "مدرس", "مدرسه", "teacher", "professeur", "prof"]],
  ["deliver", ["توصيل", "ديليفري", "دليفري", "delivery", "livraison"]],
];

const SYNONYMS = new Map<string, string>();
for (const [canonical, words] of SYNONYM_GROUPS) {
  for (const w of words) SYNONYMS.set(normalizeForSearch(w), canonical);
}

/**
 * The ways one typed word can match: itself, plus the word its everyday
 * synonyms are stored under. Arabic spellings of ة/ه and أ/ا are treated
 * as the same when looking up the synonym.
 */
export function searchAlternatives(word: string): string[] {
  const loose = word.replace(/ة/g, "ه").replace(/[أإآ]/g, "ا");
  const canonical = SYNONYMS.get(word) ?? SYNONYMS.get(loose);
  return canonical && canonical !== word ? [word, canonical] : [word];
}

/** The same rule list_profile_matches applies, for code that has the profile in hand. */
export function matchesSearch(profile: SearchableProfile, query: string): boolean {
  const text = searchableText(profile);
  return searchWords(query).every((w) => searchAlternatives(w).some((alt) => text.includes(alt)));
}
