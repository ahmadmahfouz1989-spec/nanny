import { z } from "zod";
import { DAYS, nationality } from "@/lib/validation/profile";

// generic_profiles only has top-level `full_name` / `location_id` /
// `profile_photo_url` columns -- everything else (including
// locationDetail/nationality) lives in `attributes` jsonb, same as the
// category-specific fields below.

const uuid = z.string().uuid();
// A bare `uuid` here reports Zod's generic "expected string, received null"
// when the governorate select is left on its blank option -- give it a
// message that actually points at the field.
const locationId = z.string({ message: "Choose your governorate" }).uuid("Choose your governorate");
const contactPhone = z
  .string()
  .min(6, "Enter a valid phone number")
  .max(20, "Enter a valid phone number")
  .optional();

export const CARE_SPECIALTIES = [
  "elderly_care",
  "post_surgical",
  "wound_care",
  "medication_management",
  "mobility_assistance",
  "chronic_disease_management",
  "palliative_care",
  "pediatric_nursing",
  "mental_health_support",
] as const;

export const PATIENT_AGE_GROUPS = ["infant", "child", "adult", "elderly"] as const;

export const nursingProviderSchema = z.object({
  fullName: z.string().min(2, "Enter your full name").max(80, "Name is too long"),
  contactPhone,
  locationId,
  locationDetail: z.string().trim().min(2, "Enter your area").max(120, "That's too long"),
  nationality,
  workRadiusKm: z.number().int().min(1, "Enter a work radius").max(50, "50 km max"),
  employmentType: z.enum(["full_time", "part_time", "either"]),
  liveArrangementPref: z.enum(["live_in", "live_out", "either"]),
  availability: z.object({
    days: z.array(z.enum(DAYS)).min(1, "Pick at least one available day"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  yearsExperience: z.number().min(0, "Enter your years of experience"),
  hasTransportation: z.boolean(),
  canDrive: z.boolean(),
  licenseNumber: z.string().min(3, "Enter your nursing license number").max(40, "That's too long"),
  licenseIssuingAuthority: z.string().max(120, "That's too long").optional(),
  hasNursingDiploma: z.boolean(),
  careSpecialties: z.array(z.enum(CARE_SPECIALTIES)).min(1, "Pick at least one care specialty"),
  shortIntro: z.string().max(500, "That's too long").optional(),
  languageIds: z.array(uuid).default([]),
});

export type NursingProviderInput = z.infer<typeof nursingProviderSchema>;

export const nursingSeekerSchema = z.object({
  fullName: z.string().min(2, "Enter your full name").max(80, "Name is too long"),
  contactPhone,
  locationId,
  locationDetail: z.string().trim().min(2, "Enter your area").max(120, "That's too long"),
  nationality,
  scheduleType: z.enum(["full_time", "part_time", "either"]),
  neededDays: z.array(z.enum(DAYS)).default([]),
  liveArrangement: z.enum(["live_in", "live_out", "either"]),
  desiredStartDate: z.string().refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date"),
  transportationRequired: z.boolean(),
  patientAgeGroup: z.enum(PATIENT_AGE_GROUPS, "Select who needs care"),
  careSpecialtiesNeeded: z.array(z.enum(CARE_SPECIALTIES)).min(1, "Pick at least one type of care needed"),
  medicalConditionNotes: z.string().max(1000, "That's too long").optional(),
  languageIds: z.array(uuid).default([]),
});

export type NursingSeekerInput = z.infer<typeof nursingSeekerSchema>;

// license verification is admin-set, never client-writable -- kept out of
// the input schemas above and defaulted here when a provider profile is
// first created.
export const DEFAULT_LICENSE_VERIFICATION_STATUS = "pending" as const;
