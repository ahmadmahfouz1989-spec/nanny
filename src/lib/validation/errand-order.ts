import { z } from "zod";
import { ERRAND_SERVICES, TIMINGS } from "@/lib/validation/errands";

// A Delivery & Errands order. Places are a district (required, it's what
// decides who receives the order and how far they are) plus an optional
// area and a landmark. The exact address is shared in chat once a
// provider confirms -- never here, where every provider sent the order
// can read it.

const uuid = z.string().uuid();
const detail = z.string().trim().max(160, "That's too long").optional();

// Services that go from one place to another ask where to.
export const NEEDS_DROPOFF = ["delivery", "shopping", "moto_taxi"] as const;

export const orderCreateSchema = z
  .object({
    service: z.enum(ERRAND_SERVICES, "Choose a service"),
    description: z.string().trim().min(3, "Tell them a few words about it").max(1000, "That's too long"),
    pickupDistrictId: uuid,
    pickupAreaId: uuid.nullable().optional(),
    pickupDetail: detail,
    dropoffDistrictId: uuid.nullable().optional(),
    dropoffAreaId: uuid.nullable().optional(),
    dropoffDetail: detail,
    timing: z.enum(TIMINGS, "Choose when"),
    scheduledAt: z
      .string()
      .refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date")
      .optional(),
    budgetUsd: z.number().min(0).max(10000).optional(),
  })
  .superRefine((o, ctx) => {
    if ((NEEDS_DROPOFF as readonly string[]).includes(o.service) && !o.dropoffDistrictId) {
      ctx.addIssue({ code: "custom", path: ["dropoffDistrictId"], message: "Choose where to" });
    }
    if (o.timing === "scheduled" && !o.scheduledAt) {
      ctx.addIssue({ code: "custom", path: ["scheduledAt"], message: "Pick a date and time" });
    }
  });

export type OrderCreateInput = z.infer<typeof orderCreateSchema>;

export const offerSchema = z.object({
  priceUsd: z.number().positive("Enter a price").max(10000, "That's too much"),
  etaMinutes: z.number().int().min(5, "At least 5 minutes").max(1440, "At most a day"),
  note: z.string().trim().max(300, "That's too long").optional(),
});

export const cancelSchema = z.object({ reason: z.string().trim().max(300).optional() });

export const settingsSchema = z.object({
  maxRecipients: z.number().int().min(1).max(200),
  openMinutes: z.number().int().min(5).max(1440),
});
