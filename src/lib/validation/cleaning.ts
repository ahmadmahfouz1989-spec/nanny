import { z } from "zod";
import { areaFields, coverageFields } from "@/lib/validation/area";
import { DAYS, NATIONALITIES } from "@/lib/validation/profile";

// Same split as errands.ts: everything but the name and governorate lives
// in `attributes`. A provider offers any of the services; a request is for
// one of them, and the form only asks what that service needs (rooms and
// bathrooms for a home, how many seats for a sofa wash, ...).

const uuid = z.string().uuid();
const locationId = z.string({ message: "Choose your governorate" }).uuid("Choose your governorate");
const contactPhone = z
  .string()
  .min(6, "Enter a valid phone number")
  .max(20, "Enter a valid phone number")
  .optional();

// A new service is just a new entry here plus its CleaningServices.*
// labels (and its fields in SEEKER_FIELDS below).
export const CLEANING_SERVICES = ["home", "deep", "move", "construction", "office", "windows", "upholstery", "water_tanks", "other"] as const;
export type CleaningService = (typeof CLEANING_SERVICES)[number];

// How often: once, or a regular helper -- the most common ask in Lebanon.
export const FREQUENCIES = ["once", "weekly", "twice_weekly", "biweekly", "monthly"] as const;
export type Frequency = (typeof FREQUENCIES)[number];
export const TIMINGS = ["asap", "scheduled"] as const;
export const PLACE_TYPES = ["apartment", "house", "office", "shop"] as const;
// Floor area bands, the way people describe a flat ("150 metres").
export const SIZES = ["under_100", "100_200", "200_300", "over_300"] as const;
export const DIRT_LEVELS = ["light", "heavy"] as const;
export const EXTRAS = ["oven", "fridge", "cabinets", "inside_windows", "balcony", "ironing"] as const;

export const PROVIDER_TYPES = ["individual", "team", "company"] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];
export const EQUIPMENT = ["steam", "upholstery_machine", "pressure_washer", "high_reach"] as const;
// Getting to the job: many cleaners have no car, and families often pick them up.
export const TRANSPORT = ["own", "public", "needs_pickup"] as const;
export const PRICING = ["per_hour", "per_visit", "per_item", "quote"] as const;

// The per-service checks below run even when other fields are still
// wrong, so one failed save highlights everything missing at once.
const ALWAYS = { when: () => true };

export const cleaningProviderSchema = z
  .object({
    // A team or company's business name; a person's own name otherwise.
    fullName: z.string().min(2, "Enter your name").max(80, "Name is too long"),
    contactPhone,
    locationId,
    locationDetail: z.string().trim().min(2, "Enter your area").max(120, "That's too long"),
    ...areaFields,
    ...coverageFields,
    providerType: z.enum(PROVIDER_TYPES, "Choose one"),
    teamSize: z.number().int().min(2, "A team is 2 or more").max(100, "That's too many").optional(),
    // A person's, as in the other categories; a company has none.
    nationality: z.enum(NATIONALITIES).optional(),
    cleaningServices: z.array(z.enum(CLEANING_SERVICES)).min(1, "Pick at least one service"),
    equipment: z.array(z.enum(EQUIPMENT)).default([]),
    bringsSupplies: z.boolean().default(false),
    ecoProducts: z.boolean().default(false),
    transport: z.enum(TRANSPORT, "Choose how you get to jobs"),
    availability: z.object({
      days: z.array(z.enum(DAYS)).min(1, "Pick at least one available day"),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    }),
    takesUrgentJobs: z.boolean(),
    yearsExperience: z.number().min(0, "Enter your years of experience").max(60, "That's too many"),
    languageIds: z.array(uuid).default([]),
    pricing: z.enum(PRICING, "Choose how you charge"),
    priceFromUsd: z.number().min(1, "Enter a price").max(10000, "That's too much").optional(),
    minHours: z.number().min(1).max(12, "That's too long").optional(),
    priceNote: z.string().trim().max(120, "That's too long").optional(),
    shortIntro: z.string().max(500, "That's too long").optional(),
  })
  .superRefine((p, ctx) => {
    if (p.providerType === "individual" && !p.nationality) {
      ctx.addIssue({ code: "custom", path: ["nationality"], message: "Select a nationality" });
    }
    if ((p.providerType === "team" || p.providerType === "company") && p.teamSize === undefined) {
      ctx.addIssue({ code: "custom", path: ["teamSize"], message: "How many people work with you?", params: { key: "errorTeamSize" } });
    }
  }, ALWAYS);

export type CleaningProviderInput = z.infer<typeof cleaningProviderSchema>;

const count = (max: number) => z.number().int().min(0).max(max, "That's too many").optional();

export const cleaningSeekerSchema = z
  .object({
    fullName: z.string().min(2, "Enter your full name").max(80, "Name is too long"),
    contactPhone,
    locationId,
    locationDetail: z.string().trim().min(2, "Enter your area").max(120, "That's too long"),
    ...areaFields,
    cleaningService: z.enum(CLEANING_SERVICES, "Choose a service"),
    placeType: z.enum(PLACE_TYPES).optional(),
    size: z.enum(SIZES).optional(),
    bathrooms: z.number().int().min(1).max(10, "That's too many").optional(),
    furnished: z.boolean().optional(),
    dirtLevel: z.enum(DIRT_LEVELS).optional(),
    extras: z.array(z.enum(EXTRAS)).default([]),
    windowsCount: count(200),
    highWindows: z.boolean().optional(),
    sofaSeats: count(50),
    carpets: count(50),
    mattresses: count(50),
    tankCount: count(20),
    frequency: z.enum(FREQUENCIES, "Choose how often"),
    hoursPerVisit: z.number().min(1).max(12, "That's too long").optional(),
    timing: z.enum(TIMINGS, "Choose when"),
    scheduledAt: z
      .string()
      .refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date")
      .optional(),
    neededDays: z.array(z.enum(DAYS)).default([]),
    needsSupplies: z.boolean().default(false),
    hasPets: z.boolean().default(false),
    canPickUp: z.boolean().default(false),
    budgetUsd: z.number().min(0, "Enter a budget").max(100000, "That's too much").optional(),
    jobDescription: z.string().trim().max(1000, "That's too long").optional(),
  })
  .superRefine((s, ctx) => {
    const service = s.cleaningService;
    if (!service) return;
    const asks = (field: SeekerField) => SEEKER_FIELDS[service]?.includes(field);
    if (asks("size") && !s.size) ctx.addIssue({ code: "custom", path: ["size"], message: "Choose the size", params: { key: "errorSize" } });
    if (asks("placeType") && !s.placeType) ctx.addIssue({ code: "custom", path: ["placeType"], message: "Choose the place", params: { key: "errorPlaceType" } });
    if (service === "upholstery" && !s.sofaSeats && !s.carpets && !s.mattresses) {
      ctx.addIssue({ code: "custom", path: ["sofaSeats"], message: "Say how many of at least one", params: { key: "errorItems" } });
    }
    if (service === "other" && !s.jobDescription) {
      ctx.addIssue({ code: "custom", path: ["jobDescription"], message: "Tell them what needs cleaning", params: { key: "errorDescribe" } });
    }
    if (s.frequency === "once" && s.timing === "scheduled" && !s.scheduledAt) {
      ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "Pick a date and time", params: { key: "errorWhen" } });
    }
  }, ALWAYS);

export type CleaningSeekerInput = z.infer<typeof cleaningSeekerSchema>;
type SeekerField = keyof CleaningSeekerInput;

/** Which of the optional request fields each service asks for. */
export const SEEKER_FIELDS: Record<CleaningService, readonly SeekerField[]> = {
  home: ["placeType", "size", "bathrooms", "extras", "frequency", "hoursPerVisit"],
  deep: ["placeType", "size", "bathrooms", "extras"],
  move: ["placeType", "size", "bathrooms", "furnished", "extras"],
  construction: ["placeType", "size", "dirtLevel"],
  office: ["placeType", "size", "frequency", "hoursPerVisit"],
  windows: ["placeType", "windowsCount", "highWindows"],
  upholstery: ["sofaSeats", "carpets", "mattresses"],
  water_tanks: ["tankCount"],
  other: [],
};

/** The place types that make sense for a service (an office clean isn't in a flat). */
export function placeTypesFor(service: CleaningService): readonly (typeof PLACE_TYPES)[number][] {
  return service === "office" ? ["office", "shop"] : ["apartment", "house", "office", "shop"];
}

/** Services that can be booked on a schedule; the rest are one-off jobs. */
export function isRecurring(frequency: Frequency | null | undefined) {
  return !!frequency && frequency !== "once";
}
