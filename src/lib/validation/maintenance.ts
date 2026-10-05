import { z } from "zod";
import { DAYS, nationality } from "@/lib/validation/profile";

// Same split as tutoring.ts: generic_profiles only has top-level
// `full_name` / `location_id` columns -- everything else lives in
// `attributes` jsonb. The seeker side is a job request (what needs doing,
// how soon), not a standing profile.

const uuid = z.string().uuid();
const locationId = z.string({ message: "Choose your governorate" }).uuid("Choose your governorate");
const contactPhone = z
  .string()
  .min(6, "Enter a valid phone number")
  .max(20, "Enter a valid phone number")
  .optional();

// A new trade is just a new entry here plus its Trades.* labels.
export const TRADES = ["plumber", "electrician", "painter", "tiler", "carpenter"] as const;

export const URGENCIES = ["urgent", "this_week", "flexible"] as const;

export const maintenanceProviderSchema = z.object({
  fullName: z.string().min(2, "Enter your full name").max(80, "Name is too long"),
  contactPhone,
  locationId,
  locationDetail: z.string().trim().min(2, "Enter your area").max(120, "That's too long"),
  nationality,
  trades: z.array(z.enum(TRADES)).min(1, "Pick at least one trade"),
  // Other governorates the provider also works in, besides their own.
  serviceAreaIds: z.array(uuid).max(20).default([]),
  availability: z.object({
    days: z.array(z.enum(DAYS)).min(1, "Pick at least one available day"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  yearsExperience: z.number().min(0, "Enter your years of experience"),
  takesUrgentJobs: z.boolean(),
  shortIntro: z.string().max(500, "That's too long").optional(),
});

export type MaintenanceProviderInput = z.infer<typeof maintenanceProviderSchema>;

export const maintenanceSeekerSchema = z.object({
  fullName: z.string().min(2, "Enter your full name").max(80, "Name is too long"),
  contactPhone,
  locationId,
  locationDetail: z.string().trim().min(2, "Enter your area").max(120, "That's too long"),
  tradesNeeded: z.array(z.enum(TRADES)).min(1, "Pick at least one trade"),
  jobDescription: z.string().trim().min(10, "Describe the job in a few words").max(1000, "That's too long"),
  urgency: z.enum(URGENCIES, "Select how soon you need it"),
  neededDays: z.array(z.enum(DAYS)).default([]),
  desiredStartDate: z
    .string()
    .refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date")
    .optional(),
});

export type MaintenanceSeekerInput = z.infer<typeof maintenanceSeekerSchema>;
