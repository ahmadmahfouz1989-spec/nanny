import { z } from "zod";
import { areaFields, coverageFields } from "@/lib/validation/area";
import { DAYS } from "@/lib/validation/profile";

// Same split as cleaning.ts: everything but the name and governorate lives
// in `attributes`. A provider offers any of the services (and, inside each,
// the treatments they do); a request is for one service and the treatments
// wanted from it.

const uuid = z.string().uuid();
const locationId = z.string({ message: "Choose your governorate" }).uuid("Choose your governorate");
const contactPhone = z
  .string()
  .min(6, "Enter a valid phone number")
  .max(20, "Enter a valid phone number")
  .optional();

// A new service is an entry here plus its BeautyServices.* labels; a new
// treatment is an entry in TREATMENTS plus its BeautyTreatments.* label.
export const BEAUTY_SERVICES = ["hair", "nails", "makeup", "skin", "massage", "hair_removal", "lashes_brows", "bridal", "other"] as const;
export type BeautyService = (typeof BEAUTY_SERVICES)[number];

// Codes are unique across services, so one flat list of labels serves all.
export const TREATMENTS: Record<BeautyService, readonly string[]> = {
  hair: ["cut", "blowdry", "color", "highlights", "keratin", "styling", "hair_extensions", "barber"],
  nails: ["manicure", "pedicure", "gel", "nail_extensions", "nail_art", "removal"],
  makeup: ["everyday", "evening", "photoshoot", "lesson"],
  skin: ["classic_facial", "deep_cleansing", "hydrating", "anti_aging", "acne"],
  massage: ["relaxing", "deep_tissue", "sports", "lymphatic", "prenatal", "reflexology"],
  hair_removal: ["wax", "sugaring", "threading"],
  lashes_brows: ["lash_extensions", "lash_lift", "brow_shaping", "brow_lamination", "tint"],
  bridal: ["bride_hair", "bride_makeup", "trial", "party"],
  other: [],
};
const ALL_TREATMENTS = Object.values(TREATMENTS).flat() as [string, ...string[]];

// Where it happens: most of Lebanon's home beauty work is the provider
// coming over; some work from home or a studio, salons have their own place.
export const WORKPLACES = ["client_home", "own_place", "salon"] as const;
export const PLACES = ["at_home", "go_to_them", "either"] as const;
export type Place = (typeof PLACES)[number];

export const FOR_WHOM = ["woman", "man", "child"] as const;
export type ForWhom = (typeof FOR_WHOM)[number];
export const SERVES = ["women", "men", "kids"] as const;
// A team or salon can be all women, all men, or both.
export const GENDERS = ["female", "male", "mixed"] as const;
export type Gender = (typeof GENDERS)[number];
export const GENDER_PREFERENCES = ["any", "female", "male"] as const;
export type GenderPreference = (typeof GENDER_PREFERENCES)[number];

export const PROVIDER_TYPES = ["individual", "team", "salon"] as const;
export type BeautyProviderType = (typeof PROVIDER_TYPES)[number];
export const TIMINGS = ["asap", "scheduled"] as const;
export const HAIR_LENGTHS = ["short", "medium", "long"] as const;
export const MASSAGE_MINUTES = [30, 60, 90, 120] as const;
export const REMOVAL_AREAS = ["face", "underarms", "arms", "legs", "bikini", "full_body"] as const;
export const PRICING = ["per_session", "per_hour", "quote"] as const;

// The per-service checks below run even when other fields are still
// wrong, so one failed save highlights everything missing at once.
const ALWAYS = { when: () => true };

export const beautyProviderSchema = z
  .object({
    // A team or salon's name; a person's own name otherwise.
    fullName: z.string().min(2, "Enter your name").max(80, "Name is too long"),
    contactPhone,
    locationId,
    locationDetail: z.string().trim().max(120, "That's too long").default(""),
    ...areaFields,
    ...coverageFields,
    providerType: z.enum(PROVIDER_TYPES, "Choose one"),
    teamSize: z.number().int().min(2, "A team is 2 or more").max(100, "That's too many").optional(),
    gender: z.enum(GENDERS, "Choose one"),
    serves: z.array(z.enum(SERVES)).min(1, "Pick at least one"),
    workplaces: z.array(z.enum(WORKPLACES)).min(1, "Pick at least one"),
    beautyServices: z.array(z.enum(BEAUTY_SERVICES)).min(1, "Pick at least one service"),
    treatments: z.array(z.enum(ALL_TREATMENTS)).default([]),
    certified: z.boolean().default(false),
    bringsKit: z.boolean().default(false),
    chargesTravel: z.boolean().default(false),
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
    priceNote: z.string().trim().max(160, "That's too long").optional(),
    shortIntro: z.string().max(500, "That's too long").optional(),
  })
  .superRefine((p, ctx) => {
    if (p.providerType === "individual" && p.gender === "mixed") {
      ctx.addIssue({ code: "custom", path: ["gender"], message: "Choose one", params: { key: "errorChoose" } });
    }
    if (p.providerType === "team" && p.teamSize === undefined) {
      ctx.addIssue({ code: "custom", path: ["teamSize"], message: "How many people work with you?", params: { key: "errorTeamSize" } });
    }
  }, ALWAYS);

export type BeautyProviderInput = z.infer<typeof beautyProviderSchema>;

export const beautySeekerSchema = z
  .object({
    fullName: z.string().min(2, "Enter your full name").max(80, "Name is too long"),
    contactPhone,
    locationId,
    locationDetail: z.string().trim().max(120, "That's too long").default(""),
    ...areaFields,
    beautyService: z.enum(BEAUTY_SERVICES, "Choose a service"),
    treatments: z.array(z.enum(ALL_TREATMENTS)).default([]),
    hairLength: z.enum(HAIR_LENGTHS).optional(),
    massageMinutes: z.number().int().refine((m) => (MASSAGE_MINUTES as readonly number[]).includes(m)).optional(),
    removalAreas: z.array(z.enum(REMOVAL_AREAS)).default([]),
    peopleCount: z.number().int().min(1).max(30, "That's too many").default(1),
    forWhom: z.enum(FOR_WHOM, "Choose who it's for"),
    providerGender: z.enum(GENDER_PREFERENCES).default("any"),
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
    if (s.beautyService === "other" && !s.jobDescription) {
      ctx.addIssue({ code: "custom", path: ["jobDescription"], message: "Tell them what you need", params: { key: "errorDescribeNeed" } });
    }
    if (s.timing === "scheduled" && !s.scheduledAt) {
      ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "Pick a date and time", params: { key: "errorWhen" } });
    }
  }, ALWAYS);

export type BeautySeekerInput = z.infer<typeof beautySeekerSchema>;

/** A wedding has a date: bridal requests are always booked ahead. */
export const SCHEDULED_ONLY: readonly BeautyService[] = ["bridal"];
/** Services that can be for several people (a bride and her party, a mother and daughters). */
export const GROUP_SERVICES: readonly BeautyService[] = ["hair", "nails", "makeup", "bridal"];

/** The client the request is for, as a provider's "serves" value. */
export function servesFor(forWhom: ForWhom): (typeof SERVES)[number] {
  return forWhom === "man" ? "men" : forWhom === "child" ? "kids" : "women";
}
