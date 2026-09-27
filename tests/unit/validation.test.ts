import { describe, expect, it } from "vitest";
import { nannyProviderSchema, nannySeekerSchema } from "@/lib/validation/nanny";
import { nursingProviderSchema, nursingSeekerSchema } from "@/lib/validation/nursing";
import { tutoringProviderSchema, tutoringSeekerSchema } from "@/lib/validation/tutoring";

const LOCATION = "11111111-1111-4111-8111-111111111111";
const base = { fullName: "Test Person", locationId: LOCATION, locationDetail: "Hamra", nationality: "lebanese", languageIds: [] };
const availability = { days: ["mon"], startTime: "08:00", endTime: "16:00" };

describe("profile validation", () => {
  it("accepts a complete nanny profile, photo not required", () => {
    const nanny = {
      ...base, workRadiusKm: 10, employmentType: "full_time", liveArrangementPref: "live_out", availability,
      yearsExperience: 3, hasTransportation: false, canDrive: false, experience: [{ ageGroup: "toddler", yearsExperience: 3 }],
    };
    expect(nannyProviderSchema.safeParse(nanny).success).toBe(true);
    expect(nannyProviderSchema.safeParse({ ...nanny, experience: [] }).success).toBe(false);
    expect(nannyProviderSchema.safeParse({ ...nanny, availability: { ...availability, days: [] } }).success).toBe(false);
  });

  it("accepts a complete parent request", () => {
    const parent = {
      ...base, numChildren: 2, childrenAgeRanges: ["toddler"], scheduleType: "either", liveArrangement: "live_out",
      desiredStartDate: "2026-11-01", transportationRequired: false,
    };
    expect(nannySeekerSchema.safeParse(parent).success).toBe(true);
    expect(nannySeekerSchema.safeParse({ ...parent, childrenAgeRanges: [] }).success).toBe(false);
    expect(nannySeekerSchema.safeParse({ ...parent, numChildren: 0 }).success).toBe(false);
  });

  it("requires a nursing license and a specialty", () => {
    const nurse = {
      ...base, workRadiusKm: 10, employmentType: "part_time", liveArrangementPref: "either", availability,
      yearsExperience: 5, hasTransportation: true, canDrive: true, licenseNumber: "RN-1234", hasNursingDiploma: true,
      careSpecialties: ["elderly_care"],
    };
    expect(nursingProviderSchema.safeParse(nurse).success).toBe(true);
    expect(nursingProviderSchema.safeParse({ ...nurse, licenseNumber: "" }).success).toBe(false);
    expect(nursingProviderSchema.safeParse({ ...nurse, careSpecialties: [] }).success).toBe(false);
    const seeker = {
      ...base, scheduleType: "full_time", liveArrangement: "live_out", desiredStartDate: "2026-11-01",
      transportationRequired: false, patientAgeGroup: "elderly", careSpecialtiesNeeded: ["wound_care"],
    };
    expect(nursingSeekerSchema.safeParse(seeker).success).toBe(true);
  });

  it("validates tutoring profiles", () => {
    const tutor = {
      ...base, subjects: ["math"], gradeLevels: ["middle_school"], format: "online", availability,
      yearsExperience: 2, hasTransportation: false,
    };
    const tutorResult = tutoringProviderSchema.safeParse(tutor);
    expect(tutorResult.success, JSON.stringify(tutorResult.error?.issues)).toBe(true);
    const seeker = { ...base, subjectsNeeded: ["math"], gradeLevel: "middle_school", format: "either", neededDays: [], desiredStartDate: "2026-11-01", transportationRequired: false };
    const seekerResult = tutoringSeekerSchema.safeParse(seeker);
    expect(seekerResult.success, JSON.stringify(seekerResult.error?.issues)).toBe(true);
  });

  it("rejects a missing governorate with a readable message", () => {
    const r = nannySeekerSchema.safeParse({ ...base, locationId: null });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.message === "Choose your governorate")).toBe(true);
  });
});
