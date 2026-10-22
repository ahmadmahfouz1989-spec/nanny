import { describe, expect, it } from "vitest";
import { nannyProviderSchema, nannySeekerSchema } from "@/lib/validation/nanny";
import { nursingProviderSchema, nursingSeekerSchema } from "@/lib/validation/nursing";
import { tutoringProviderSchema, tutoringSeekerSchema } from "@/lib/validation/tutoring";
import { maintenanceProviderSchema, maintenanceSeekerSchema } from "@/lib/validation/maintenance";
import { errandProviderSchema, errandSeekerSchema } from "@/lib/validation/errands";

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

  it("validates home maintenance profiles", () => {
    const worker = {
      ...base, trades: ["plumber", "tiler"], serviceAreaIds: [LOCATION], availability,
      yearsExperience: 6, takesUrgentJobs: true,
    };
    const workerResult = maintenanceProviderSchema.safeParse(worker);
    expect(workerResult.success, JSON.stringify(workerResult.error?.issues)).toBe(true);
    expect(maintenanceProviderSchema.safeParse({ ...worker, trades: [] }).success).toBe(false);
    expect(maintenanceProviderSchema.safeParse({ ...worker, trades: ["astronaut"] }).success).toBe(false);

    const request = {
      fullName: "Test Person", locationId: LOCATION, locationDetail: "Hamra",
      tradesNeeded: ["electrician"], jobDescription: "Two sockets in the kitchen stopped working", urgency: "urgent",
    };
    const requestResult = maintenanceSeekerSchema.safeParse(request);
    expect(requestResult.success, JSON.stringify(requestResult.error?.issues)).toBe(true);
    expect(maintenanceSeekerSchema.safeParse({ ...request, jobDescription: "fix" }).success).toBe(false);
    expect(maintenanceSeekerSchema.safeParse({ ...request, urgency: "someday" }).success).toBe(false);
  });

  it("validates delivery & errands profiles per service", () => {
    const rider = {
      ...base, errandServices: ["delivery", "queue"], availability, takesUrgentJobs: true,
      vehicle: "motorcycle", pricing: "per_task", maxWaitHours: 2,
    };
    const riderResult = errandProviderSchema.safeParse(rider);
    expect(riderResult.success, JSON.stringify(riderResult.error?.issues)).toBe(true);
    // Delivery needs a way to get around; queues need a longest wait.
    expect(errandProviderSchema.safeParse({ ...rider, vehicle: undefined }).success).toBe(false);
    expect(errandProviderSchema.safeParse({ ...rider, maxWaitHours: undefined }).success).toBe(false);
    // Paperwork alone can be done on foot without saying so.
    expect(errandProviderSchema.safeParse({ ...rider, errandServices: ["paperwork"], vehicle: undefined }).success).toBe(true);
    // Moto taxi: a licensed rider on a motorcycle.
    const taxi = { ...rider, errandServices: ["moto_taxi"] };
    expect(errandProviderSchema.safeParse(taxi).success).toBe(false);
    expect(errandProviderSchema.safeParse({ ...taxi, hasDrivingLicense: true }).success).toBe(true);
    expect(errandProviderSchema.safeParse({ ...taxi, hasDrivingLicense: true, vehicle: "car" }).success).toBe(false);

    const request = {
      fullName: "Test Person", locationId: LOCATION, locationDetail: "Hamra",
      errandService: "delivery", jobDescription: "A set of keys", pickupPlace: "Hamra", dropoffPlace: "Achrafieh", timing: "asap",
    };
    const requestResult = errandSeekerSchema.safeParse(request);
    expect(requestResult.success, JSON.stringify(requestResult.error?.issues)).toBe(true);
    expect(errandSeekerSchema.safeParse({ ...request, dropoffPlace: undefined }).success).toBe(false);
    expect(errandSeekerSchema.safeParse({ ...request, timing: "scheduled" }).success).toBe(false);
    expect(errandSeekerSchema.safeParse({ ...request, timing: "scheduled", scheduledAt: "2026-11-02T09:30" }).success).toBe(true);
    expect(errandSeekerSchema.safeParse({ ...request, errandService: "paperwork" }).success).toBe(false);
    expect(errandSeekerSchema.safeParse({ ...request, errandService: "paperwork", institution: "Baabda Municipality" }).success).toBe(true);
    expect(errandSeekerSchema.safeParse({ ...request, errandService: "moto_taxi", passengers: 3 }).success).toBe(false);
  });

  it("rejects a missing governorate with a readable message", () => {
    const r = nannySeekerSchema.safeParse({ ...base, locationId: null });
    expect(r.success).toBe(false);
    expect(r.error?.issues.some((i) => i.message === "Choose your governorate")).toBe(true);
  });
});
