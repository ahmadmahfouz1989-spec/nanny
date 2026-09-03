import { z } from "zod";

export const AGE_GROUPS = [
  "newborn",
  "infant",
  "toddler",
  "preschool",
  "school_age",
  "teen",
] as const;

export const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

export const NATIONALITIES = [
  "lebanese",
  "syrian",
  "palestinian",
  "egyptian",
  "ethiopian",
  "filipino",
  "bangladeshi",
  "sri_lankan",
  "nepalese",
  "kenyan",
  "ghanaian",
  "sierra_leonean",
  "sudanese",
  "iraqi",
  "jordanian",
  "indian",
  "cameroonian",
  "ivorian",
  "other",
] as const;

const uuid = z.string().uuid();
const contactPhone = z
  .string()
  .min(6, "Enter a valid phone number")
  .max(20, "Enter a valid phone number")
  .optional();

export const parentProfileSchema = z.object({
  fullName: z.string().min(2).max(80),
  contactPhone,
  locationId: uuid,
  locationDetail: z.string().trim().min(2).max(120),
  nationality: z.enum(NATIONALITIES),
  numChildren: z.number().int().min(1).max(10),
  childrenAgeRanges: z.array(z.enum(AGE_GROUPS)).min(1),
  scheduleType: z.enum(["full_time", "part_time", "either"]),
  liveArrangement: z.enum(["live_in", "live_out", "either"]),
  desiredStartDate: z
    .string()
    .refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date")
    .refine((d) => new Date(d) >= new Date(new Date().toDateString()), "Start date can't be in the past"),
  transportationRequired: z.boolean(),
  additionalDuties: z.array(z.string()).default([]),
  familyDescription: z.string().max(1000).optional(),
  languageIds: z.array(uuid).default([]),
});

export type ParentProfileInput = z.infer<typeof parentProfileSchema>;

export const nannyExperienceEntrySchema = z.object({
  ageGroup: z.enum(AGE_GROUPS),
  yearsExperience: z.number().min(0),
});

export const nannyProfileSchema = z.object({
  fullName: z.string().min(2).max(80),
  contactPhone,
  profilePhotoUrl: z.string().url(),
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
  certifications: z.array(z.string()).default([]),
  shortIntro: z.string().max(500).optional(),
  languageIds: z.array(uuid).default([]),
  experience: z.array(nannyExperienceEntrySchema).min(1),
});

export type NannyProfileInput = z.infer<typeof nannyProfileSchema>;
