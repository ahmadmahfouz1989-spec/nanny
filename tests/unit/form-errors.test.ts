import { describe, expect, it } from "vitest";
import { fieldErrorsFor } from "@/lib/form-errors";
import { nannyProviderSchema, nannySeekerSchema } from "@/lib/validation/nanny";

// What a nanny seeker form sends before anything is filled in.
const blankSeeker = {
  fullName: "",
  locationId: null,
  locationDetail: "",
  nationality: "",
  numChildren: 0,
  childrenAgeRanges: [],
  scheduleType: "",
  neededDays: [],
  liveArrangement: "",
  desiredStartDate: "",
  transportationRequired: false,
};

describe("fieldErrorsFor", () => {
  it("asks to type into empty text fields and to choose in empty selects", () => {
    const errors = fieldErrorsFor(nannySeekerSchema, blankSeeker);
    expect(errors.fullName).toBe("errorRequired");
    expect(errors.locationDetail).toBe("errorRequired");
    expect(errors.desiredStartDate).toBe("errorRequired");
    expect(errors.locationId).toBe("errorChoose");
    expect(errors.nationality).toBe("errorChoose");
    expect(errors.scheduleType).toBe("errorChoose");
    expect(errors.liveArrangement).toBe("errorChoose");
    expect(errors.childrenAgeRanges).toBe("errorPickOne");
    expect(errors.numChildren).toBe("errorNumber");
  });

  it("says too short, not empty, for a one-letter entry", () => {
    const errors = fieldErrorsFor(nannySeekerSchema, { ...blankSeeker, fullName: "A", locationDetail: "B" });
    expect(errors.fullName).toBe("errorTooShort");
    expect(errors.locationDetail).toBe("errorTooShort");
  });

  it("reports nested problems under the top-level field, and nothing for a valid form", () => {
    const provider = {
      fullName: "Layla",
      locationId: "6f1c2a7e-8a7b-4c1e-9d3f-2b5a4c6d7e8f",
      districtId: "7a2d3b8f-9b8c-4d2f-8e4a-3c6b5d7e8f9a",
      locationDetail: "Achrafieh",
      nationality: "lebanese",
      workRadiusKm: 10,
      employmentType: "full_time",
      liveArrangementPref: "live_out",
      availability: { days: [], startTime: "08:00", endTime: "17:00" },
      yearsExperience: 3,
      hasTransportation: false,
      canDrive: false,
      experience: [{ ageGroup: "toddler", yearsExperience: 3 }],
    };
    expect(fieldErrorsFor(nannyProviderSchema, provider)).toEqual({ availability: "errorPickOne" });
    expect(fieldErrorsFor(nannyProviderSchema, { ...provider, availability: { ...provider.availability, days: ["mon"] } })).toEqual({});
  });
});
