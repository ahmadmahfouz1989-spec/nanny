import { z } from "zod";
import { DAYS, NATIONALITIES } from "@/lib/validation/profile";

// generic_profiles only has top-level `full_name` / `location_id` columns --
// everything else (including locationDetail/nationality/photo, which are
// real columns on parent_profiles/nanny_profiles) lives in `attributes`
// jsonb here, same as the category-specific fields below.

const uuid = z.string().uuid();
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
  fullName: z.string().min(2).max(80),
  contactPhone,
  locationId: uuid,
  locationDetail: z.string().trim().min(2).max(120),
  nationality: z.enum(NATIONALITIES),
  workRadiusKm: z.number().int().min(1).max(50),
  employmentType: z.enum(["full_time", "part_time", "either"]),
  liveArrangementPref: z.enum(["live_in", "live_out", "either"]),
  availability: z.object({
    days: z.array(z.enum(DAYS)).min(1),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  yearsExperience: z.number().min(0),
  hasTransportation: z.boolean(),
  canDrive: z.boolean(),
  licenseNumber: z.string().min(3).max(40),
  licenseIssuingAuthority: z.string().max(120).optional(),
  careSpecialties: z.array(z.enum(CARE_SPECIALTIES)).min(1),
  shortIntro: z.string().max(500).optional(),
  languageIds: z.array(uuid).default([]),
});

export type NursingProviderInput = z.infer<typeof nursingProviderSchema>;

export const nursingSeekerSchema = z.object({
  fullName: z.string().min(2).max(80),
  contactPhone,
  locationId: uuid,
  locationDetail: z.string().trim().min(2).max(120),
  nationality: z.enum(NATIONALITIES),
  scheduleType: z.enum(["full_time", "part_time", "either"]),
  neededDays: z.array(z.enum(DAYS)).default([]),
  liveArrangement: z.enum(["live_in", "live_out", "either"]),
  desiredStartDate: z.string().refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date"),
  transportationRequired: z.boolean(),
  patientAgeGroup: z.enum(PATIENT_AGE_GROUPS),
  careSpecialtiesNeeded: z.array(z.enum(CARE_SPECIALTIES)).min(1),
  medicalConditionNotes: z.string().max(1000).optional(),
  languageIds: z.array(uuid).default([]),
});

export type NursingSeekerInput = z.infer<typeof nursingSeekerSchema>;

// license verification is admin-set, never client-writable -- kept out of
// the input schemas above and defaulted here when a provider profile is
// first created.
export const DEFAULT_LICENSE_VERIFICATION_STATUS = "pending" as const;
