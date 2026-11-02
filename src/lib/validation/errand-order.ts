import { z } from "zod";
import { ERRAND_SERVICES, TIMINGS } from "@/lib/validation/errands";
import { TRADES } from "@/lib/validation/maintenance";

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
    // Delivery & Errands, or a Home Maintenance job asking for quotes.
    category: z.enum(["errands", "maintenance"]).default("errands"),
    service: z.enum([...ERRAND_SERVICES, ...TRADES], "Choose a service"),
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
    // Photos already uploaded through /api/order-photos (paths in the
    // caller's own folder -- checked by the route).
    photoPaths: z.array(z.string().max(200)).max(3, "Up to 3 photos").default([]),
    // Only asked when we don't know the customer's name yet.
    fullName: z.string().trim().min(2, "Enter your name").max(80, "Name is too long").optional(),
  })
  .superRefine((o, ctx) => {
    const trades = TRADES as readonly string[];
    if ((o.category === "maintenance") !== trades.includes(o.service)) {
      ctx.addIssue({ code: "custom", path: ["service"], message: "Choose a service" });
    }
    if (o.category === "errands" && o.photoPaths.length > 0) {
      ctx.addIssue({ code: "custom", path: ["photoPaths"], message: "Photos are for repair jobs" });
    }
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

/** A repair quote: a price, or "from–to", and when they can come. */
export const quoteSchema = z
  .object({
    priceUsd: z.number().positive("Enter a price").max(10000, "That's too much"),
    priceMaxUsd: z.number().positive().max(10000, "That's too much").optional(),
    visitAt: z
      .string()
      .refine((d) => !Number.isNaN(Date.parse(d)), "Pick when you can come")
      .refine((d) => Date.parse(d) > Date.now() - 60 * 60_000, "Pick a time from now on"),
    note: z.string().trim().max(300, "That's too long").optional(),
  })
  .refine((q) => q.priceMaxUsd === undefined || q.priceMaxUsd >= q.priceUsd, { path: ["priceMaxUsd"], message: "The top of the range is below the start" });

export const cancelSchema = z.object({ reason: z.string().trim().max(300).optional() });

export const settingsSchema = z.object({
  maxRecipients: z.number().int().min(1).max(200),
  openMinutes: z.number().int().min(5).max(1440),
  quoteOpenMinutes: z.number().int().min(60).max(10080).optional(),
});
