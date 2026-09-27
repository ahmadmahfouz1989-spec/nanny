import { describe, expect, it } from "vitest";
import { matchesSearch, normalizeForSearch } from "@/lib/profile-search";

const beirut = { name_en: "Beirut", name_ar: "بيروت", name_fr: "Beyrouth" };
const mount = { name_en: "Mount Lebanon", name_ar: "جبل لبنان", name_fr: "Mont-Liban" };
const en = { name_en: "English", name_ar: "الإنجليزية", name_fr: "Anglais" };
const ar = { name_en: "Arabic", name_ar: "العربية", name_fr: "Arabe" };
const fr = { name_en: "French", name_ar: "الفرنسية", name_fr: "Français" };

const layla = {
  full_name: "Layla Haddad",
  locations: beirut,
  languages: [en, ar],
  attributes: {
    locationDetail: "Achrafieh",
    nationality: "lebanese",
    certifications: ["first_aid_cpr"],
    shortIntro: "Warm and experienced.",
    experience: [{ ageGroup: "toddler", yearsExperience: 5 }],
    employmentType: "full_time",
    licenseNumber: "SECRET-123",
  },
};
const maya = {
  full_name: "Maya Khalil",
  locations: mount,
  languages: [ar, fr],
  attributes: { nationality: "syrian", experience: [{ ageGroup: "infant", yearsExperience: 3 }], employmentType: "part_time" },
};
const family = {
  full_name: "Karim Fares",
  locations: beirut,
  languages: [en],
  attributes: { childrenAgeRanges: ["toddler", "school_age"], additionalDuties: ["cooking"], familyDescription: "Family of four.", medicalConditionNotes: "diabetes" },
};
const tutor = { full_name: "Rita", locations: beirut, languages: [], attributes: { subjects: ["math"], gradeLevels: ["middle_school"], format: "online" } };

describe("matchesSearch", () => {
  it.each([
    ["name", layla, "layla", true],
    ["partial name", layla, "hadd", true],
    ["tag in English", layla, "cpr", true],
    ["tag in Arabic", layla, "إسعافات", true],
    ["tag the profile doesn't have", maya, "cpr", false],
    ["language", maya, "french", true],
    ["language in Arabic", maya, "الفرنسية", true],
    ["area", layla, "beirut", true],
    ["area in Arabic", layla, "بيروت", true],
    ["neighbourhood", layla, "achrafieh", true],
    ["every word must match", layla, "beirut cpr", true],
    ["one word missing", maya, "beirut cpr", false],
    ["experience age group", layla, "toddler", true],
    ["nationality", maya, "syrian", true],
    ["schedule", maya, "part-time", true],
    ["case and accents", maya, "FRANÇAIS", true],
    ["Arabic diacritics", layla, "بَيروت", true],
    ["children's ages", family, "school age", true],
    ["duties", family, "cooking", true],
    ["family description", family, "four", true],
    ["subject", tutor, "math", true],
    ["grade level", tutor, "middle school", true],
    ["tutoring format", tutor, "online", true],
    ["never searches license numbers", layla, "SECRET", false],
    ["never searches medical notes", family, "diabetes", false],
    ["blank query matches everything", maya, "   ", true],
  ])("%s", (_label, profile, query, expected) => {
    expect(matchesSearch(profile as never, query as string)).toBe(expected);
  });

  it("normalizes case, accents and Arabic diacritics", () => {
    expect(normalizeForSearch("Ça Va")).toBe("ca va");
    expect(normalizeForSearch("بَيْرُوت")).toBe("بيروت");
  });
});
