import { z } from "zod";
import { AGE_GROUPS, DAYS, nationality } from "@/lib/validation/profile";

// Nanny's seeker (parent) and provider (nanny) profiles, stored like every
// other category's: full_name/location_id as columns, the photo in
// generic_profiles.profile_photo_url, everything else in attributes.
// profilePhotoUrl is read and checked by /api/generic-profile itself (it
// must be the user's own upload), so it isn't part of these schemas.

const uuid = z.string().uuid();
const locationId = z.string({ message: "Choose your governorate" }).uuid("Choose your governorate");
const contactPhone = z
  .string()
  .min(6, "Enter a valid phone number")
  .max(20, "Enter a valid phone number")
  .optional();

export const nannySeekerSchema = z.object({
  fullName: z.string().min(2).max(80),
  contactPhone,
  locationId,
  locationDetail: z.string().trim().min(2).max(120),
  nationality,
  numChildren: z.number().int().min(1).max(10),
  childrenAgeRanges: z.array(z.enum(AGE_GROUPS)).min(1),
  scheduleType: z.enum(["full_time", "part_time", "either"]),
  neededDays: z.array(z.enum(DAYS)).default([]),
  liveArrangement: z.enum(["live_in", "live_out", "either"]),
  desiredStartDate: z.string().refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date"),
  transportationRequired: z.boolean(),
  additionalDuties: z.array(z.string()).default([]),
  familyDescription: z.string().max(1000).optional(),
  languageIds: z.array(uuid).default([]),
});

export const nannyExperienceEntrySchema = z.object({
  ageGroup: z.enum(AGE_GROUPS),
  yearsExperience: z.number().min(0),
});

export const nannyProviderSchema = z.object({
  fullName: z.string().min(2).max(80),
  contactPhone,
  locationId,
  locationDetail: z.string().trim().min(2).max(120),
  nationality,
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
