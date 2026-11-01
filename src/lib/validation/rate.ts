import { z } from "zod";

// A provider's price ("from $5 an hour") and a request's budget, for the
// categories that started without one: nanny, nursing, tutoring and home
// maintenance. Kept as one object each (`rate`, `budget`) so they never
// clash with the newer categories' own price keys. Both are optional --
// profiles made before them stay valid.

export const RATE_UNITS = ["per_hour", "per_day", "per_month", "per_session", "per_job"] as const;
export type RateUnit = (typeof RATE_UNITS)[number];

/** How each category usually charges, in the order offered. */
export const CATEGORY_RATE_UNITS: Record<string, readonly RateUnit[]> = {
  // Hourly babysitting, or a monthly salary for a full-time or live-in nanny.
  nanny: ["per_hour", "per_month"],
  // Hourly visits, a day or night shift, or a monthly live-in carer.
  nursing: ["per_hour", "per_day", "per_month"],
  tutoring: ["per_hour", "per_session", "per_month"],
  maintenance: ["per_job", "per_hour", "per_day"],
};

export const rateSchema = z
  .object({
    // "quote": agreed once they know the job.
    unit: z.enum([...RATE_UNITS, "quote"]),
    fromUsd: z.number().min(1, "Enter a price").max(100000, "That's too much").optional(),
    note: z.string().trim().max(160, "That's too long").optional(),
  })
  .optional();

export const budgetSchema = z
  .object({
    unit: z.enum(RATE_UNITS),
    maxUsd: z.number().min(1, "Enter a budget").max(100000, "That's too much"),
  })
  .optional();

export type Rate = NonNullable<z.infer<typeof rateSchema>>;
export type Budget = NonNullable<z.infer<typeof budgetSchema>>;
