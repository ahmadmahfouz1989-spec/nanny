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

// A place picked on the map: the point, Google's address and place name,
// what to do there, and who to ask for. All optional: without a map (no
// Maps key yet) an order is a district, an area and a landmark as before.
const point = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });
const phone = z
  .string()
  .trim()
  .max(30)
  .refine((v) => v === "" || /^\+?[0-9 ()-]{6,30}$/.test(v), "Enter a phone number, or leave it empty")
  .optional();
const placeText = {
  address: z.string().trim().max(300).optional(),
  name: z.string().trim().max(160, "That's too long").optional(),
  instructions: z.string().trim().max(500, "That's too long").optional(),
  contactName: z.string().trim().max(80, "That's too long").optional(),
};

// Services that go from one place to another ask where to.
export const NEEDS_DROPOFF = ["delivery", "shopping", "moto_taxi"] as const;

export const orderCreateSchema = z
  .object({
    // Delivery & Errands, or a Home Maintenance job asking for quotes.
    category: z.enum(["errands", "maintenance"]).default("errands"),
    service: z.enum([...ERRAND_SERVICES, ...TRADES], "Choose a service"),
    description: z.string().trim().min(3, "Tell them a few words about it").max(1000, "That's too long"),
    // A district from the list, or a point on the map (the district is then
    // worked out from it).
    pickupDistrictId: uuid.optional(),
    pickupAreaId: uuid.nullable().optional(),
    pickupDetail: detail,
    dropoffDistrictId: uuid.nullable().optional(),
    dropoffAreaId: uuid.nullable().optional(),
    dropoffDetail: detail,
    pickupPoint: point.nullable().optional(),
    pickupAddress: placeText.address,
    pickupPlaceName: placeText.name,
    pickupInstructions: placeText.instructions,
    pickupContactName: placeText.contactName,
    pickupContactPhone: phone,
    dropoffPoint: point.nullable().optional(),
    dropoffAddress: placeText.address,
    dropoffPlaceName: placeText.name,
    dropoffInstructions: placeText.instructions,
    dropoffContactName: placeText.contactName,
    dropoffContactPhone: phone,
    timing: z.enum(TIMINGS, "Choose when"),
    scheduledAt: z
      .string()
      .refine((d) => !Number.isNaN(Date.parse(d)), "Invalid date")
      .optional(),
    budgetUsd: z.number().min(0).max(10000).optional(),
    // Photos already uploaded through /api/order-photos (paths in the
    // caller's own folder -- checked by the route).
    photoPaths: z.array(z.string().max(200)).max(3, "Up to 3 photos").default([]),
    // A delivery sent to one rider the customer picked, not the nearest ones.
    providerProfileId: uuid.optional(),
    // Only asked when we don't know the customer's name yet.
    fullName: z.string().trim().min(2, "Enter your name").max(80, "Name is too long").optional(),
  })
  .superRefine((o, ctx) => {
    const trades = TRADES as readonly string[];
    if ((o.category === "maintenance") !== trades.includes(o.service)) {
      ctx.addIssue({ code: "custom", path: ["service"], message: "Choose a service" });
    }
    if (o.category === "maintenance" && o.providerProfileId) {
      ctx.addIssue({ code: "custom", path: ["providerProfileId"], message: "Repair requests go to every tradesperson" });
    }
    if (o.category === "errands" && o.photoPaths.length > 0) {
      ctx.addIssue({ code: "custom", path: ["photoPaths"], message: "Photos are for repair jobs" });
    }
    if (!o.pickupDistrictId && !o.pickupPoint) {
      ctx.addIssue({ code: "custom", path: ["pickupDistrictId"], message: "Choose where" });
    }
    if ((NEEDS_DROPOFF as readonly string[]).includes(o.service) && !o.dropoffDistrictId && !o.dropoffPoint) {
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

// The matching settings, as the admin dashboard edits them. Times in
// seconds, distances in km.
export const settingsSchema = z
  .object({
    maxRecipients: z.number().int().min(1).max(200),
    openMinutes: z.number().int().min(5).max(1440),
    quoteOpenMinutes: z.number().int().min(60).max(10080).optional(),
    waveSize: z.number().int().min(1, "At least 1 provider per wave").max(50),
    responseSeconds: z.number().int().min(30, "At least 30 seconds to answer").max(3600),
    chooseSeconds: z.number().int().min(30, "At least 30 seconds to choose").max(3600),
    confirmSeconds: z.number().int().min(30, "At least 30 seconds to confirm").max(3600),
    initialRadiusKm: z.number().positive().max(300),
    radiusStepKm: z.number().positive().max(300),
    maxRadiusKm: z.number().positive().max(300),
    maxActiveOrders: z.number().int().min(1).max(10),
    nearbyFallbackKm: z.number().min(0).max(300),
  })
  .refine((s) => s.maxRadiusKm >= s.initialRadiusKm, { path: ["maxRadiusKm"], message: "The widest radius must be at least the starting radius" });

export type SettingsInput = z.infer<typeof settingsSchema>;
