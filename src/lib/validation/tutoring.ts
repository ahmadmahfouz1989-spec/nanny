import { z } from "zod";
import { DAYS, nationality } from "@/lib/validation/profile";

// Same split as nursing.ts: generic_profiles only has top-level
// `full_name` / `location_id` columns -- everything else lives in
// `attributes` jsonb.

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

export const SUBJECTS = [
  "math",
  "science",
  "english",
  "arabic",
  "french",
  "physics",
  "chemistry",
  "biology",
  "computer_science",
  "test_prep",
] as const;

export const GRADE_LEVELS = ["elementary", "middle_school", "high_school", "university", "adult"] as const;

export const TUTORING_FORMATS = ["online", "in_person", "either"] as const;

export const tutoringProviderSchema = z.object({
  fullName: z.string().min(2, "Enter your full name").max(80, "Name is too long"),
  contactPhone,
  locationId,
  locationDetail: z.string().trim().min(2, "Enter your area").max(120, "That's too long"),
  nationality,
  subjects: z.array(z.enum(SUBJECTS)).min(1, "Pick at least one subject"),
  gradeLevels: z.array(z.enum(GRADE_LEVELS)).min(1, "Pick at least one grade level"),
  format: z.enum(TUTORING_FORMATS),
  availability: z.object({
    days: z.array(z.enum(DAYS)).min(1, "Pick at least one available day"),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    endTime: z.string().regex(/^\d{2}:\d{2}$/),
  }),
  yearsExperience: z.number().min(0, "Enter your years of experience"),
  hasTransportation: z.boolean(),
  shortIntro: z.string().max(500, "That's too long").optional(),
  languageIds: z.array(uuid).default([]),
});

export type TutoringProviderInput = z.infer<typeof tutoringProviderSchema>;

export const tutoringSeekerSchema = z.object({
  fullName: z.string().min(2, "Enter your full name").max(80, "Name is too long"),
  contactPhone,
  locationId,
  locationDetail: z.string().trim().min(2, "Enter your area").max(120, "That's too long"),
  nationality,
  subjectsNeeded: z.array(z.enum(SUBJECTS)).min(1, "Pick at least one subject"),
  gradeLevel: z.enum(GRADE_LEVELS, "Select a grade level"),
  format: z.enum(TUTORING_FORMATS),
  neededDays: z.array(z.enum(DAYS)).default([]),
  desiredStartDate: z.string().refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date"),
  transportationRequired: z.boolean(),
  additionalNotes: z.string().max(1000, "That's too long").optional(),
  languageIds: z.array(uuid).default([]),
});

export type TutoringSeekerInput = z.infer<typeof tutoringSeekerSchema>;
