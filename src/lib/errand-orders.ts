import { createAdminClient } from "@/lib/supabase/admin";
import { placeOf, placeScore } from "@/lib/matching/place";
import { notify } from "@/lib/push";
import type { ErrandService } from "@/lib/validation/errands";
import type { Trade } from "@/lib/validation/maintenance";

// Delivery & Errands orders, Phase 1 (see the migration
// 20261102000002_errand_orders.sql for the tables). An order goes to every
// eligible provider at once, nearest first; providers offer a price and a
// time or decline; the customer picks; the provider confirms; then the
// provider moves it through its stages. No waves or timers yet -- an
// order still open after errand_settings.open_minutes closes as
// "no provider".
//
// Home Maintenance quotes use the same tables (category = 'maintenance'):
// the service is a trade, there's no Available switch, a tradesperson can
// have several jobs at once, and requests stay open longer (see
// 20261103000001_maintenance_quotes.sql).

type Admin = ReturnType<typeof createAdminClient>;

export const ORDER_STATUSES = [
  "open",
  "reserved",
  "accepted",
  "on_the_way",
  "arrived",
  "picked_up",
  "delivered",
  "completed",
  "cancelled",
  "no_provider",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_CATEGORIES = ["errands", "maintenance"] as const;
export type OrderCategory = (typeof ORDER_CATEGORIES)[number];
export type OrderService = ErrandService | Trade;

export const isOrderCategory = (v: unknown): v is OrderCategory => (ORDER_CATEGORIES as readonly unknown[]).includes(v);

/** The stages a confirmed delivery moves through, in order. */
export const PROGRESS: readonly OrderStatus[] = ["accepted", "on_the_way", "arrived", "picked_up", "delivered", "completed"];

/** A repair job has nothing to pick up: on the way, arrived, done ("delivered"), completed. */
export const JOB_PROGRESS: readonly OrderStatus[] = ["accepted", "on_the_way", "arrived", "delivered", "completed"];

export const progressFor = (category: string): readonly OrderStatus[] => (category === "maintenance" ? JOB_PROGRESS : PROGRESS);

/** A provider with an order in one of these is busy: no new orders reach them. */
export const BUSY_STATUSES: readonly OrderStatus[] = ["accepted", "on_the_way", "arrived", "picked_up"];

/** Still going: shown at the top of both sides' lists. */
export const LIVE_STATUSES: readonly OrderStatus[] = ["open", "reserved", ...BUSY_STATUSES, "delivered"];

/**
 * The stage the provider's button moves an order to, or null when it's not
 * the provider's to move (open, reserved, done). Completing is the
 * customer's (they confirm it was done), or the provider's once delivered.
 */
export function nextProviderStatus(status: OrderStatus, category = "errands"): OrderStatus | null {
  const steps = progressFor(category);
  const i = steps.indexOf(status);
  return i >= 0 && i < steps.length - 1 ? steps[i + 1]! : null;
}

export type ErrandSettings = { max_recipients: number; open_minutes: number; quote_open_minutes: number };

export async function errandSettings(db: Admin): Promise<ErrandSettings> {
  const { data } = await db.from("errand_settings").select("max_recipients, open_minutes, quote_open_minutes").eq("id", true).maybeSingle();
  return data ?? { max_recipients: 20, open_minutes: 60, quote_open_minutes: 1440 };
}

/** How long a new order stays open for offers, in minutes. */
export const openMinutesFor = (settings: ErrandSettings, category: string) =>
  category === "maintenance" ? settings.quote_open_minutes : settings.open_minutes;

/** Straight-line distance in km between two points (haversine). */
export function distanceKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return Math.round(6371 * 2 * Math.asin(Math.sqrt(h)) * 10) / 10;
}

type Point = { lat: number; lon: number };

async function pointsById(db: Admin, ids: (string | null | undefined)[]): Promise<Map<string, Point & { parent: string | null }>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const out = new Map<string, Point & { parent: string | null }>();
  if (unique.length === 0) return out;
  const { data } = await db.from("locations").select("id, lat, lon, parent_location_id").in("id", unique);
  for (const row of data ?? []) {
    if (row.lat !== null && row.lon !== null) out.set(row.id, { lat: row.lat, lon: row.lon, parent: row.parent_location_id });
  }
  return out;
}

export async function categoryIdOf(db: Admin, slug: OrderCategory): Promise<string | null> {
  const { data } = await db.from("categories").select("id").eq("slug", slug).maybeSingle();
  return data?.id ?? null;
}

export const errandsCategoryId = (db: Admin) => categoryIdOf(db, "errands");

export type Candidate = { profileId: string; userId: string; distanceKm: number | null };

/**
 * Providers who can take this order right now, nearest first: approved,
 * active, switched to available, not suspended, offering the service,
 * covering the pickup district (or, for older profiles, its governorate),
 * and not busy with another order. Distance runs from the pickup area (or
 * its district) to the provider's own area (or district, or governorate)
 * -- the centres of those places, since nobody shares a live location.
 *
 * A repair job instead goes to tradespeople of that trade anywhere in the
 * governorate (nearest first): there are fewer of them, they travel, and
 * they have no Available switch or one-job limit.
 */
export async function eligibleProviders(
  db: Admin,
  order: { category?: string; service: OrderService; pickupDistrictId: string; pickupAreaId: string | null; seekerUserId: string },
  options: { exclude?: string[]; limit: number },
): Promise<Candidate[]> {
  const jobs = order.category === "maintenance";
  const categoryId = await categoryIdOf(db, jobs ? "maintenance" : "errands");
  if (!categoryId) return [];

  const pickup = await pointsById(db, [order.pickupAreaId, order.pickupDistrictId]);
  const pickupDistrict = pickup.get(order.pickupDistrictId);
  const pickupGovernorate = pickupDistrict?.parent ?? null;
  const pickupPoint = (order.pickupAreaId && pickup.get(order.pickupAreaId)) || pickupDistrict || null;

  let query = db
    .from("generic_profiles")
    .select("id, user_id, location_id, attributes")
    .eq("category_id", categoryId)
    .eq("role", "provider")
    .eq("status", "active")
    .eq("moderation_status", "approved")
    .neq("user_id", order.seekerUserId);
  if (!jobs) query = query.eq("available_now", true);
  const { data: providers } = await query;

  const exclude = new Set(options.exclude ?? []);
  const offering = (providers ?? []).filter((p) => {
    if (exclude.has(p.id)) return false;
    const a = (p.attributes ?? {}) as Record<string, unknown>;
    const offered = jobs ? a.trades : a.errandServices;
    const services = Array.isArray(offered) ? offered : [];
    if (!services.includes(order.service)) return false;
    const seekerPlace = { governorateId: pickupGovernorate, districtId: order.pickupDistrictId };
    // 1 = works in that district; 0.5 = same governorate but not that
    // district -- not "covering" it, so a delivery isn't sent; a repair job is.
    const score = placeScore(seekerPlace, placeOf(p as { location_id: string | null; attributes: Record<string, unknown> }));
    const a2 = a as { districtId?: unknown };
    if (jobs) return score > 0;
    return typeof a2.districtId === "string" ? score === 1 : score > 0;
  });
  if (offering.length === 0) return [];

  const userIds = [...new Set(offering.map((p) => p.user_id))];
  const profileIds = offering.map((p) => p.id);
  const [{ data: users }, { data: busy }] = await Promise.all([
    db.from("users").select("id, status").in("id", userIds),
    jobs
      ? Promise.resolve({ data: [] as { provider_profile_id: string | null }[] })
      : db.from("errand_orders").select("provider_profile_id").in("provider_profile_id", profileIds).in("status", [...BUSY_STATUSES]),
  ]);
  const suspended = new Set((users ?? []).filter((u) => u.status === "suspended").map((u) => u.id));
  const busyIds = new Set((busy ?? []).map((o) => o.provider_profile_id));
  const free = offering.filter((p) => !suspended.has(p.user_id) && !busyIds.has(p.id));

  const attr = (p: (typeof free)[number], key: string) => {
    const v = ((p.attributes ?? {}) as Record<string, unknown>)[key];
    return typeof v === "string" ? v : null;
  };
  const points = await pointsById(db, free.flatMap((p) => [attr(p, "areaId"), attr(p, "districtId"), p.location_id]));
  const ranked = free.map((p) => {
    const home = points.get(attr(p, "areaId") ?? "") ?? points.get(attr(p, "districtId") ?? "") ?? points.get(p.location_id ?? "");
    return { profileId: p.id, userId: p.user_id, distanceKm: pickupPoint && home ? distanceKm(pickupPoint, home) : null };
  });
  // Unknown distances last; ties broken by id so the order is stable.
  ranked.sort((a, b) => (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity) || a.profileId.localeCompare(b.profileId));
  return ranked.slice(0, options.limit);
}

export async function logOrderEvent(
  db: Admin,
  orderId: string,
  actor: { userId: string | null; role: "seeker" | "provider" | "admin" | "system" },
  type: string,
  detail: Record<string, unknown> = {},
) {
  await db.from("errand_order_events").insert({
    order_id: orderId,
    actor_user_id: actor.userId,
    actor_role: actor.role,
    type,
    detail: detail as { [key: string]: string | number | boolean | null },
  });
}

/**
 * Sends the order to the nearest eligible providers not yet sent it and
 * notifies them. Returns how many received it. Used when an order is
 * created, when the customer retries, when an admin resends, and when a
 * reservation falls through.
 */
export async function dispatchOrder(
  db: Admin,
  order: { id: string; number: number; category?: string; service: OrderService; pickup_district_id: string; pickup_area_id: string | null; seeker_user_id: string },
  actor: { userId: string | null; role: "seeker" | "provider" | "admin" | "system" },
): Promise<number> {
  const settings = await errandSettings(db);
  const { data: already } = await db.from("errand_order_recipients").select("provider_profile_id, rank").eq("order_id", order.id);
  const candidates = await eligibleProviders(
    db,
    {
      category: order.category,
      service: order.service,
      pickupDistrictId: order.pickup_district_id,
      pickupAreaId: order.pickup_area_id,
      seekerUserId: order.seeker_user_id,
    },
    { exclude: (already ?? []).map((r) => r.provider_profile_id), limit: Math.max(0, settings.max_recipients - (already ?? []).length) },
  );
  if (candidates.length === 0) {
    await logOrderEvent(db, order.id, actor, "dispatched", { count: 0 });
    return 0;
  }
  const start = Math.max(0, ...(already ?? []).map((r) => r.rank));
  const { error } = await db.from("errand_order_recipients").insert(
    candidates.map((c, i) => ({
      order_id: order.id,
      provider_profile_id: c.profileId,
      provider_user_id: c.userId,
      distance_km: c.distanceKm,
      rank: start + i + 1,
    })),
  );
  if (error) {
    console.error("[errand-orders] dispatch failed:", error.message);
    return 0;
  }
  await logOrderEvent(db, order.id, actor, "dispatched", {
    count: candidates.length,
    providers: candidates.map((c) => ({ profile_id: c.profileId, distance_km: c.distanceKm })),
  });
  await notify(
    candidates.map((c) => ({
      user_id: c.userId,
      type: "errand_request",
      payload: { order_id: order.id, order_number: order.number, service: order.service, category_slug: order.category ?? "errands" },
    })),
  );
  return candidates.length;
}

/**
 * Closes orders that sat open past their time with no offer chosen, as
 * "no provider" -- checked whenever orders are read, so no scheduler is
 * needed. Returns the ids it closed.
 */
export async function closeExpiredOrders(db: Admin, filter: { seekerUserId?: string; orderId?: string } = {}): Promise<string[]> {
  let query = db
    .from("errand_orders")
    .update({ status: "no_provider", status_changed_at: new Date().toISOString(), cancelled_by: "system" })
    .eq("status", "open")
    .lt("open_until", new Date().toISOString());
  if (filter.seekerUserId) query = query.eq("seeker_user_id", filter.seekerUserId);
  if (filter.orderId) query = query.eq("id", filter.orderId);
  const { data } = await query.select("id, number, seeker_user_id, category");
  for (const order of data ?? []) {
    await logOrderEvent(db, order.id, { userId: null, role: "system" }, "expired");
    await db.from("errand_order_recipients").update({ status: "not_selected" }).eq("order_id", order.id).in("status", ["sent", "offered"]);
    await notify({
      user_id: order.seeker_user_id,
      type: "errand_no_provider",
      payload: { order_id: order.id, order_number: order.number, category_slug: order.category },
    });
  }
  return (data ?? []).map((o) => o.id);
}

/**
 * Opens (or reuses) the conversation between the customer and the
 * provider, so they can share the exact address and details. Uses the
 * existing match table: open messaging works on any match.
 */
export async function ensureConversation(
  db: Admin,
  seekerProfileId: string | null,
  providerProfileId: string,
  category: OrderCategory = "errands",
): Promise<string | null> {
  if (!seekerProfileId) return null;
  const categoryId = await categoryIdOf(db, category);
  if (!categoryId) return null;
  const { data: existing } = await db
    .from("generic_matches")
    .select("id")
    .eq("seeker_profile_id", seekerProfileId)
    .eq("provider_profile_id", providerProfileId)
    .maybeSingle();
  if (existing) return existing.id;
  const { data, error } = await db
    .from("generic_matches")
    .insert({
      category_id: categoryId,
      seeker_profile_id: seekerProfileId,
      provider_profile_id: providerProfileId,
      score: 100,
      score_breakdown: { source: "order" },
    })
    .select("id")
    .single();
  if (error) {
    console.error("[errand-orders] conversation not opened:", error.message);
    return null;
  }
  return data.id;
}

/**
 * The caller's Delivery & Errands profiles that can be used right now: the
 * request profile (needed to order -- approved or still waiting for review,
 * so a new customer isn't kept waiting on an admin) and the provider
 * profile (needed to receive orders -- approved only: riders are checked,
 * ID included, before they get anyone's order).
 */
export async function myErrandProfiles(db: Admin, userId: string, category: OrderCategory = "errands") {
  const categoryId = await categoryIdOf(db, category);
  if (!categoryId) return { seeker: null, provider: null };
  const { data } = await db
    .from("generic_profiles")
    .select("id, role, status, moderation_status, available_now")
    .eq("user_id", userId)
    .eq("category_id", categoryId)
    .neq("status", "draft");
  const rows = data ?? [];
  const seeker =
    rows.find((p) => p.role === "seeker" && p.status === "active" && p.moderation_status === "approved") ??
    rows.find((p) => p.role === "seeker" && p.status === "active" && p.moderation_status === "pending") ??
    null;
  const provider = rows.find((p) => p.role === "provider" && p.moderation_status === "approved") ?? null;
  return { seeker, provider };
}
