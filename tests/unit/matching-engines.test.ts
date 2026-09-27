import { describe, expect, it } from "vitest";
import {
  computeMatchScore,
  nannyInputFromProfile,
  parentInputFromProfile,
  type NannyMatchInput,
  type ParentMatchInput,
} from "@/lib/matching/engine";
import { computeCareMatchScore, type CareProviderMatchInput, type CareSeekerMatchInput } from "@/lib/matching/generic-engine";
import {
  computeTutoringMatchScore,
  type TutoringProviderMatchInput,
  type TutoringSeekerMatchInput,
} from "@/lib/matching/tutoring-engine";

const BEIRUT = { governorateId: "beirut" };
const MOUNT = { governorateId: "mount" };

describe("nanny rubric", () => {
  const parent: ParentMatchInput = {
    location: BEIRUT,
    neededDays: ["mon", "tue"],
    scheduleType: "full_time",
    liveArrangement: "live_out",
    transportationRequired: true,
    childrenAgeRanges: ["toddler"],
    languageIds: ["en"],
  };
  const nanny: NannyMatchInput = {
    location: BEIRUT,
    employmentType: "full_time",
    liveArrangementPref: "live_out",
    availabilityDays: ["mon", "tue", "wed"],
    hasTransportation: true,
    languageIds: ["en", "ar"],
    experienceAgeGroups: ["toddler"],
  };

  it("scores a perfect fit 100 with every criterion met", () => {
    const r = computeMatchScore(parent, nanny);
    expect(r.score).toBe(100);
    expect(Object.values(r.breakdown).every((c) => c.met)).toBe(true);
  });

  it("loses exactly each criterion's weight", () => {
    expect(computeMatchScore(parent, { ...nanny, location: MOUNT }).score).toBe(70);
    expect(computeMatchScore(parent, { ...nanny, hasTransportation: false }).score).toBe(95);
    expect(computeMatchScore(parent, { ...nanny, experienceAgeGroups: [] }).score).toBe(93);
    expect(computeMatchScore(parent, { ...nanny, availabilityDays: ["mon"] }).score).toBe(87.5);
  });

  it("treats 'either' as compatible and no stated needs as a full match", () => {
    const flexible = { ...parent, scheduleType: "either" as const, languageIds: [], childrenAgeRanges: [] };
    expect(computeMatchScore(flexible, { ...nanny, employmentType: "part_time", languageIds: [], experienceAgeGroups: [] }).score).toBe(100);
  });

  it("scores flexible days by how many days the nanny covers", () => {
    const r = computeMatchScore({ ...parent, neededDays: [] }, { ...nanny, availabilityDays: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] });
    expect(r.breakdown.availability.raw).toBe(1);
  });

  it("reads profiles stored as attributes, ignoring 0-year experience", () => {
    const n = nannyInputFromProfile({
      location_id: "beirut",
      attributes: {
        employmentType: "full_time",
        liveArrangementPref: "either",
        availability: { days: ["mon"], startTime: "08:00" },
        hasTransportation: true,
        languageIds: ["en"],
        experience: [
          { ageGroup: "toddler", yearsExperience: 3 },
          { ageGroup: "infant", yearsExperience: 0 },
        ],
      },
    });
    expect(n.experienceAgeGroups).toEqual(["toddler"]);
    expect(n.availabilityDays).toEqual(["mon"]);
    const p = parentInputFromProfile({ location_id: "beirut", attributes: {} });
    expect(p.neededDays).toEqual([]);
    expect(p.transportationRequired).toBe(false);
  });
});

describe("nursing rubric", () => {
  const seeker: CareSeekerMatchInput = {
    location: BEIRUT,
    neededDays: ["mon"],
    scheduleType: "part_time",
    liveArrangement: "live_out",
    transportationRequired: false,
    careSpecialtiesNeeded: ["elderly_care", "wound_care"],
    languageIds: [],
  };
  const provider: CareProviderMatchInput = {
    location: BEIRUT,
    employmentType: "part_time",
    liveArrangementPref: "live_out",
    availabilityDays: ["mon"],
    hasTransportation: false,
    careSpecialties: ["elderly_care", "wound_care"],
    languageIds: [],
  };

  it("scores a perfect fit 100", () => {
    expect(computeCareMatchScore(seeker, provider).score).toBe(100);
  });

  it("counts specialties proportionally", () => {
    const r = computeCareMatchScore(seeker, { ...provider, careSpecialties: ["elderly_care"] });
    expect(r.breakdown.specialty.raw).toBe(0.5);
    expect(r.breakdown.specialty.met).toBe(false);
    expect(r.score).toBe(96.5);
  });
});

describe("tutoring rubric", () => {
  const seeker: TutoringSeekerMatchInput = {
    location: BEIRUT,
    neededDays: ["mon"],
    format: "in_person",
    transportationRequired: true,
    subjectsNeeded: ["math"],
    gradeLevel: "middle_school",
    languageIds: [],
  };
  const provider: TutoringProviderMatchInput = {
    location: BEIRUT,
    availabilityDays: ["mon"],
    format: "either",
    hasTransportation: true,
    subjects: ["math", "science"],
    gradeLevels: ["middle_school"],
    languageIds: [],
  };

  it("scores a perfect fit 100", () => {
    expect(computeTutoringMatchScore(seeker, provider).score).toBe(100);
  });

  it("only requires transportation for in-person lessons", () => {
    expect(computeTutoringMatchScore(seeker, { ...provider, hasTransportation: false }).breakdown.format.raw).toBe(0);
    const online = { ...seeker, format: "online" as const };
    expect(computeTutoringMatchScore(online, { ...provider, hasTransportation: false }).breakdown.format.raw).toBe(1);
  });

  it("requires the exact grade level", () => {
    expect(computeTutoringMatchScore({ ...seeker, gradeLevel: "high_school" }, provider).breakdown.gradeLevel.raw).toBe(0);
  });
});
