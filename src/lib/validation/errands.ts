import { z } from "zod";
import { DAYS, nationality } from "@/lib/validation/profile";

// Same split as maintenance.ts: everything but the name and governorate
// lives in `attributes`. A provider offers any of the five services; a
// seeker's request is for one of them, and the form only asks what that
// service needs (pickup and drop-off for a delivery, the office for
// paperwork, ...). The service-specific text always goes in
// `jobDescription` so match cards show it the same way as a repair job.

const uuid = z.string().uuid();
const locationId = z.string({ message: "Choose your governorate" }).uuid("Choose your governorate");
const contactPhone = z
  .string()
  .min(6, "Enter a valid phone number")
  .max(20, "Enter a valid phone number")
  .optional();
const place = z.string().trim().min(2, "Enter the area or a landmark").max(160, "That's too long");

// A new service is just a new entry here plus its ErrandServices.* labels
// (and its fields in errandSeekerSchema below).
export const ERRAND_SERVICES = ["delivery", "paperwork", "queue", "shopping", "moto_taxi"] as const;
export type ErrandService = (typeof ERRAND_SERVICES)[number];

export const VEHICLES = ["motorcycle", "car", "bicycle", "on_foot"] as const;
export const PRICING = ["per_task", "per_hour", "per_distance"] as const;
export const TIMINGS = ["asap", "scheduled"] as const;

// The per-service checks below run even when other fields are still
// wrong, so one failed save highlights everything missing at once rather
// than revealing the pickup field only after the name is filled in. The
// values can be partly invalid then, hence the defensive reads.
const ALWAYS = { when: () => true };

// Services that move something (or someone) across town need a way to get there.
const NEEDS_VEHICLE: readonly ErrandService[] = ["delivery", "shopping", "moto_taxi"];

export const errandProviderSchema = z
  .object({
    fullName: z.string().min(2, "Enter your full name").max(80, "Name is too long"),
    contactPhone,
    locationId,
    locationDetail: z.string().trim().min(2, "Enter your area").max(120, "That's too long"),
    nationality,
    errandServices: z.array(z.enum(ERRAND_SERVICES)).min(1, "Pick at least one service"),
    // Other governorates the provider also works in, besides their own.
    serviceAreaIds: z.array(uuid).max(20).default([]),
    availability: z.object({
      days: z.array(z.enum(DAYS)).min(1, "Pick at least one available day"),
      startTime: z.string().regex(/^\d{2}:\d{2}$/),
      endTime: z.string().regex(/^\d{2}:\d{2}$/),
    }),
    takesUrgentJobs: z.boolean(),
    vehicle: z.enum(VEHICLES).optional(),
    pricing: z.enum(PRICING, "Choose how you charge"),
    priceNote: z.string().trim().max(120, "That's too long").optional(),
    canDoMultipleStops: z.boolean().default(false),
    canPayForPurchases: z.boolean().default(false),
    // How long they'll stand in a queue; only asked when they do queues.
    maxWaitHours: z.number().min(0.5, "Enter how long you can wait").max(24, "That's too long").optional(),
    paperworkTypes: z.string().trim().max(300, "That's too long").optional(),
    // Moto taxi: what a passenger would want to know before getting on.
    hasDrivingLicense: z.boolean().default(false),
    hasInsurance: z.boolean().default(false),
    hasPassengerHelmet: z.boolean().default(false),
    shortIntro: z.string().max(500, "That's too long").optional(),
  })
  .superRefine((p, ctx) => {
    const services = Array.isArray(p.errandServices) ? p.errandServices : [];
    if (!p.vehicle && services.some((s) => NEEDS_VEHICLE.includes(s))) {
      ctx.addIssue({ code: "custom", path: ["vehicle"], message: "Choose how you get around" });
    }
    if (services.includes("moto_taxi") && p.vehicle !== "motorcycle") {
      ctx.addIssue({ code: "custom", path: ["vehicle"], message: "Moto taxi needs a motorcycle" });
    }
    if (services.includes("moto_taxi") && !p.hasDrivingLicense) {
      ctx.addIssue({ code: "custom", path: ["hasDrivingLicense"], message: "Moto taxi needs a driving license" });
    }
    if (services.includes("queue") && p.maxWaitHours === undefined) {
      ctx.addIssue({ code: "custom", path: ["maxWaitHours"], message: "Enter how long you can wait" });
    }
  }, ALWAYS);

export type ErrandProviderInput = z.infer<typeof errandProviderSchema>;

export const errandSeekerSchema = z
  .object({
    fullName: z.string().min(2, "Enter your full name").max(80, "Name is too long"),
    contactPhone,
    locationId,
    locationDetail: z.string().trim().min(2, "Enter your area").max(120, "That's too long"),
    errandService: z.enum(ERRAND_SERVICES, "Choose a service"),
    jobDescription: z.string().trim().min(3, "Tell them a few words about it").max(1000, "That's too long"),
    // Areas or landmarks only -- the exact address is shared in chat.
    pickupPlace: place.optional(),
    dropoffPlace: place.optional(),
    institution: z.string().trim().max(160, "That's too long").optional(),
    storeName: z.string().trim().max(160, "That's too long").optional(),
    budgetUsd: z.number().min(0, "Enter a budget").max(100000, "That's too much").optional(),
    expectedWaitHours: z.number().min(0.5, "Enter how long").max(24, "That's too long").optional(),
    passengers: z.number().int().min(1).max(2, "A motorcycle takes one passenger, two at most").optional(),
    timing: z.enum(TIMINGS, "Choose when"),
    scheduledAt: z
      .string()
      .refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date")
      .optional(),
    deadline: z
      .string()
      .refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date")
      .optional(),
    notes: z.string().trim().max(500, "That's too long").optional(),
  })
  .superRefine((s, ctx) => {
    const need = (field: "pickupPlace" | "dropoffPlace" | "institution", message: string) => {
      if (!s[field]) ctx.addIssue({ code: "custom", path: [field], message });
    };
    if (s.errandService === "delivery" || s.errandService === "moto_taxi") {
      need("pickupPlace", "Enter the pickup area");
      need("dropoffPlace", s.errandService === "moto_taxi" ? "Enter the destination" : "Enter the drop-off area");
    }
    if (s.errandService === "shopping") need("dropoffPlace", "Enter where to bring it");
    if (s.errandService === "queue") need("pickupPlace", "Enter where the queue is");
    if (s.errandService === "paperwork") need("institution", "Enter the office or institution");
    if (s.timing === "scheduled" && !s.scheduledAt) {
      ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "Pick a date and time" });
    }
  }, ALWAYS);

export type ErrandSeekerInput = z.infer<typeof errandSeekerSchema>;

/** Which of the optional request fields each service asks for. */
export const SEEKER_FIELDS: Record<ErrandService, readonly (keyof ErrandSeekerInput)[]> = {
  delivery: ["pickupPlace", "dropoffPlace"],
  paperwork: ["institution", "deadline"],
  queue: ["pickupPlace", "expectedWaitHours"],
  shopping: ["storeName", "budgetUsd", "dropoffPlace"],
  moto_taxi: ["pickupPlace", "dropoffPlace", "passengers"],
};
