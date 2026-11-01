import { z } from "zod";
import { areaFields, coverageFields } from "@/lib/validation/area";
import { DAYS } from "@/lib/validation/profile";

// Same split as beauty.ts: everything but the name and governorate lives
// in `attributes`. A provider offers any of the services; a request is for
// one of them, says what's wrong (the service's issues) and about the car.

const uuid = z.string().uuid();
const locationId = z.string({ message: "Choose your governorate" }).uuid("Choose your governorate");
const contactPhone = z
  .string()
  .min(6, "Enter a valid phone number")
  .max(20, "Enter a valid phone number")
  .optional();

// A new service is an entry here plus its CarServices.* labels; a new
// issue is an entry in ISSUES plus its CarIssues.* label.
export const CAR_SERVICES = ["mechanic", "electrical", "battery", "tires", "ac", "towing", "roadside", "body_paint", "car_wash", "inspection", "other"] as const;
export type CarService = (typeof CAR_SERVICES)[number];

// What the client says is wrong (or wanted). Codes are unique across
// services, so one flat list of labels serves all.
export const ISSUES: Record<CarService, readonly string[]> = {
  mechanic: ["wont_start", "noise", "warning_light", "leak", "overheating", "brakes", "suspension", "servicing"],
  electrical: ["lights", "wiring", "starter_alternator", "sensors", "windows_locks"],
  battery: ["dead_battery", "replace_battery"],
  tires: ["flat", "replace_tires", "alignment"],
  ac: ["not_cold", "recharge", "bad_smell"],
  towing: [],
  roadside: ["jump_start", "change_tire", "fuel_delivery", "lockout"],
  body_paint: ["dents", "scratches", "after_accident", "full_paint"],
  car_wash: ["exterior", "interior", "full_detail", "polish"],
  inspection: ["pre_purchase", "mecanique", "diagnostics"],
  other: [],
};
const ALL_ISSUES = Object.values(ISSUES).flat() as [string, ...string[]];

// The car comes to them or they come to the car: a mobile mechanic, a
// garage, or a garage that picks the car up and brings it back.
export const WORKPLACES = ["mobile", "garage", "pickup"] as const;
export const PLACES = ["at_location", "bring_to_them", "pickup", "either"] as const;
export type CarPlace = (typeof PLACES)[number];
/** Always done where the car is -- no "where" question. */
export const ON_THE_SPOT: readonly CarService[] = ["towing", "roadside"];
/** Where "can it be driven?" changes things. */
export const ASKS_DRIVABLE: readonly CarService[] = ["mechanic", "electrical", "battery", "tires", "body_paint"];
/** Where petrol, diesel, hybrid or electric matters to who can do it. */
export const FUEL_MATTERS: readonly CarService[] = ["mechanic", "electrical", "battery", "ac", "inspection"];

export const PROVIDER_TYPES = ["individual", "garage", "company"] as const;
export type CarProviderType = (typeof PROVIDER_TYPES)[number];
// The most common makes on Lebanese roads; anything else is "other".
export const MAKES = [
  "toyota", "kia", "hyundai", "nissan", "mercedes", "bmw", "honda", "chevrolet", "mitsubishi",
  "peugeot", "renault", "volkswagen", "ford", "jeep", "suzuki", "other",
] as const;
export const FUELS = ["petrol", "diesel", "hybrid", "electric"] as const;
export type Fuel = (typeof FUELS)[number];
// Petrol is a given; these are what not every mechanic does.
export const EXTRA_FUELS = ["diesel", "hybrid", "electric"] as const;
export const EQUIPMENT = ["diagnostic_scanner", "flatbed"] as const;
// "Now" is stuck at the side of the road.
export const TIMINGS = ["emergency", "asap", "scheduled"] as const;
export type CarTiming = (typeof TIMINGS)[number];
export const PRICING = ["per_job", "per_hour", "quote"] as const;

// The per-service checks below run even when other fields are still
// wrong, so one failed save highlights everything missing at once.
const ALWAYS = { when: () => true };

export const carProviderSchema = z
  .object({
    // A garage or company's name; a person's own name otherwise.
    fullName: z.string().min(2, "Enter your name").max(80, "Name is too long"),
    contactPhone,
    locationId,
    locationDetail: z.string().trim().min(2, "Enter your area").max(120, "That's too long"),
    ...areaFields,
    ...coverageFields,
    providerType: z.enum(PROVIDER_TYPES, "Choose one"),
    carServices: z.array(z.enum(CAR_SERVICES)).min(1, "Pick at least one service"),
    workplaces: z.array(z.enum(WORKPLACES)).min(1, "Pick at least one"),
    // Empty: all makes.
    makes: z.array(z.enum(MAKES)).default([]),
    fuels: z.array(z.enum(EXTRA_FUELS)).default([]),
    equipment: z.array(z.enum(EQUIPMENT)).default([]),
    warranty: z.boolean().default(false),
    emergency24h: z.boolean().default(false),
    availability: z.object({
      days: z.array(z.enum(DAYS)).min(1, "Pick at least one available day"),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    }),
    takesUrgentJobs: z.boolean(),
    yearsExperience: z.number().min(0, "Enter your years of experience").max(60, "That's too many"),
    languageIds: z.array(uuid).default([]),
    pricing: z.enum(PRICING, "Choose how you charge"),
    priceFromUsd: z.number().min(1, "Enter a price").max(100000, "That's too much").optional(),
    priceNote: z.string().trim().max(160, "That's too long").optional(),
    shortIntro: z.string().max(500, "That's too long").optional(),
  });

export type CarProviderInput = z.infer<typeof carProviderSchema>;

export const carSeekerSchema = z
  .object({
    fullName: z.string().min(2, "Enter your full name").max(80, "Name is too long"),
    contactPhone,
    locationId,
    locationDetail: z.string().trim().min(2, "Enter your area").max(120, "That's too long"),
    ...areaFields,
    carService: z.enum(CAR_SERVICES, "Choose a service"),
    issues: z.array(z.enum(ALL_ISSUES)).default([]),
    carMake: z.enum(MAKES, "Choose the make"),
    carModel: z.string().trim().max(60, "That's too long").optional(),
    carYear: z.number().int().min(1950, "Enter a valid year").max(2100, "Enter a valid year").optional(),
    fuel: z.enum(FUELS).default("petrol"),
    drivable: z.boolean().optional(),
    towTo: z.string().trim().max(120, "That's too long").optional(),
    place: z.enum(PLACES, "Choose where"),
    timing: z.enum(TIMINGS, "Choose when"),
    scheduledAt: z
      .string()
      .refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date")
      .optional(),
    budgetUsd: z.number().min(0, "Enter a budget").max(100000, "That's too much").optional(),
    jobDescription: z.string().trim().max(1000, "That's too long").optional(),
  })
  .superRefine((s, ctx) => {
    if (s.carService === "towing" && !s.towTo) {
      ctx.addIssue({ code: "custom", path: ["towTo"], message: "Where should it be towed to?", params: { key: "errorTowTo" } });
    }
    if (s.carService === "other" && !s.jobDescription) {
      ctx.addIssue({ code: "custom", path: ["jobDescription"], message: "Tell them what you need", params: { key: "errorDescribeNeed" } });
    }
    if (s.timing === "scheduled" && !s.scheduledAt) {
      ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "Pick a date and time", params: { key: "errorWhen" } });
    }
    // A car that can't move can't be driven to a garage.
    if (s.drivable === false && s.place === "bring_to_them") {
      ctx.addIssue({ code: "custom", path: ["place"], message: "Choose where", params: { key: "errorNotDrivable" } });
    }
  }, ALWAYS);

export type CarSeekerInput = z.infer<typeof carSeekerSchema>;
