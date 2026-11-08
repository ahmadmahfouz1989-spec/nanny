import { createAdminClient } from "@/lib/supabase/admin";
import { placeOf, placeScore } from "@/lib/matching/place";
import { notify } from "@/lib/push";
import { quickestByRoad } from "@/lib/travel-time";
import { DEFAULT_RIDER_RANGE_KM, type ErrandService } from "@/lib/validation/errands";
import type { Trade } from "@/lib/validation/maintenance";
import type { Tables } from "@/lib/supabase/database.types";

// Delivery & Errands orders (see the migrations 20261102000002_errand_orders
// and 20261103000004_errand_waves for the tables). An order goes out in
// waves to the nearest eligible providers, widening the search radius when
// nobody is left inside it; providers offer a price and a time or decline
// within the response time; the customer picks within the choosing time;
// the chosen provider confirms within the confirmation time; then the
// provider moves it through its stages. Every number is in errand_settings,
// edited from the admin dashboard. tickOrder moves an order on once a
// deadline passes.
//
// Home Maintenance quotes use the same tables (category = 'maintenance'):
// the service is a trade, the request goes to every tradesperson at once
// with no timers, there's no Available switch, a tradesperson can have
// several jobs at once, and requests stay open longer (see
// 20261103000001_maintenance_quotes.sql).

type Admin = ReturnType<typeof createAdminClient>;
type OrderRow = Tables<"errand_orders">;

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

export type ErrandSettings = {
  max_recipients: number;
  open_minutes: number;
  quote_open_minutes: number;
  wave_size: number;
  response_seconds: number;
  choose_seconds: number;
  confirm_seconds: number;
  initial_radius_km: number;
  radius_step_km: number;
  max_radius_km: number;
  max_active_orders: number;
  /** No rider covering the pickup can take it: ask available riders this close. 0 = don't. */
  nearby_fallback_km: number;
  /** A rider who lets this many requests in a row run out goes Offline. 0 = never. */
  auto_offline_after_misses: number;
  /** How old a rider's shared position may be and still be used, in minutes. */
  location_fresh_minutes: number;
  /** How many of the nearest riders get a road travel time before a wave is picked. 0 = off. */
  travel_time_candidates: number;
  /** Most road-time elements a day (Beirut time); past it, straight lines. 0 = none. */
  travel_time_daily_limit: number;
};

export const DEFAULT_SETTINGS: ErrandSettings = {
  max_recipients: 20,
  open_minutes: 60,
  quote_open_minutes: 1440,
  wave_size: 3,
  response_seconds: 120,
  choose_seconds: 60,
  confirm_seconds: 60,
  initial_radius_km: 5,
  radius_step_km: 5,
  max_radius_km: 30,
  max_active_orders: 1,
  nearby_fallback_km: 10,
  auto_offline_after_misses: 3,
  location_fresh_minutes: 20,
  travel_time_candidates: 6,
  travel_time_daily_limit: 500,
};

export async function errandSettings(db: Admin): Promise<ErrandSettings> {
  const { data } = await db.from("errand_settings").select("*").eq("id", true).maybeSingle();
  if (!data) return DEFAULT_SETTINGS;
  const out = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS) as (keyof ErrandSettings)[]) {
    // numeric columns can arrive as strings
    if (data[key] !== null && data[key] !== undefined) out[key] = Number(data[key]);
  }
  return out;
}

/** How long a new order stays open for offers, in minutes. */
export const openMinutesFor = (settings: ErrandSettings, category: string) =>
  category === "maintenance" ? settings.quote_open_minutes : settings.open_minutes;

const inSeconds = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

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

export type Candidate = {
  profileId: string;
  userId: string;
  distanceKm: number | null;
  /** Where the distance was measured from: their phone, or their area's centre. */
  point?: { lat: number; lon: number } | null;
  /** The distance is from where their phone was a few minutes ago. */
  live?: boolean;
};

/** Orders in progress for each of these rider profiles. */
export async function activeOrderCounts(db: Admin, profileIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (profileIds.length === 0) return out;
  const { data } = await db
    .from("errand_orders")
    .select("provider_profile_id")
    .eq("category", "errands")
    .in("provider_profile_id", profileIds)
    .in("status", [...BUSY_STATUSES]);
  for (const row of data ?? []) {
    if (row.provider_profile_id) out.set(row.provider_profile_id, (out.get(row.provider_profile_id) ?? 0) + 1);
  }
  return out;
}

/** A rider who lets every request run out counts as this much further away. */
const MISS_PENALTY_KM = 5;
/**
 * Requests reach riders who are switched to Offline too; they just come
 * after the ones who said they're working (counted this much further away).
 */
const OFFLINE_PENALTY_KM = 2;

/** Where each of these riders' phones was, if it was recent enough. */
export async function freshRiderPoints(db: Admin, profileIds: string[], freshMinutes: number): Promise<Map<string, Point>> {
  const out = new Map<string, Point>();
  if (profileIds.length === 0) return out;
  const since = new Date(Date.now() - freshMinutes * 60_000).toISOString();
  const { data } = await db.from("rider_locations").select("profile_id, lat, lng").in("profile_id", profileIds).gte("located_at", since);
  for (const row of data ?? []) out.set(row.profile_id, { lat: row.lat, lon: row.lng });
  return out;
}

/**
 * How often each rider lets a request run out, 0 to 1, over their last
 * month of requests (unknown below 3 answered-or-missed requests: 0).
 */
async function missRates(db: Admin, profileIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (profileIds.length === 0) return out;
  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data } = await db
    .from("errand_order_recipients")
    .select("provider_profile_id, status")
    .in("provider_profile_id", profileIds)
    .neq("status", "sent")
    .gte("sent_at", since)
    .limit(5000);
  const tally = new Map<string, { missed: number; all: number }>();
  for (const row of data ?? []) {
    const t = tally.get(row.provider_profile_id) ?? { missed: 0, all: 0 };
    t.all++;
    if (row.status === "expired") t.missed++;
    tally.set(row.provider_profile_id, t);
  }
  for (const [id, t] of tally) if (t.all >= 3) out.set(id, t.missed / t.all);
  return out;
}

/**
 * Providers who can take this order right now, nearest first: approved,
 * active, not suspended, offering the service, and not busy (fewer orders
 * in progress than errand_settings.max_active_orders). Riders switched to
 * Offline are included, after the Available ones at the same distance.
 *
 * A rider is close enough when they cover the pickup district (their own or
 * one they ticked), or when their phone -- shared while the app is open and
 * they're Available -- was within their own range of the pickup in the last
 * errand_settings.location_fresh_minutes. Distance runs from that live
 * position when there is one, else from the centre of their area (or
 * district, or governorate). Riders who let most requests run out are
 * ranked as if they were further away.
 *
 * With `nearbyKm`, coverage gives way to distance: available riders that
 * close, for when nobody covering the district can take the order.
 *
 * A repair job instead goes to tradespeople of that trade anywhere in the
 * governorate (nearest first): there are fewer of them, they travel, and
 * they have no Available switch or one-job limit.
 */
export async function eligibleProviders(
  db: Admin,
  order: {
    category?: string;
    service: OrderService;
    pickupDistrictId: string;
    pickupAreaId: string | null;
    seekerUserId: string;
    /** The exact pickup picked on the map, when there is one: distances run from it. */
    pickupPoint?: { lat: number; lng: number } | null;
  },
  // nearbyKm: everyone that close instead of everyone covering the district.
  options: { exclude?: string[]; limit: number; maxActive?: number; nearbyKm?: number; anywhere?: boolean; only?: string; freshMinutes?: number },
): Promise<Candidate[]> {
  const jobs = order.category === "maintenance";
  const categoryId = await categoryIdOf(db, jobs ? "maintenance" : "errands");
  if (!categoryId) return [];

  const pickup = await pointsById(db, [order.pickupAreaId, order.pickupDistrictId]);
  const pickupDistrict = pickup.get(order.pickupDistrictId);
  const pickupGovernorate = pickupDistrict?.parent ?? null;
  const pickupPoint =
    (order.pickupPoint ? { lat: order.pickupPoint.lat, lon: order.pickupPoint.lng } : null) ||
    (order.pickupAreaId && pickup.get(order.pickupAreaId)) ||
    pickupDistrict ||
    null;

  let query = db
    .from("generic_profiles")
    .select("id, user_id, location_id, attributes, available_now")
    .eq("category_id", categoryId)
    .eq("role", "provider")
    .eq("status", "active")
    .eq("moderation_status", "approved")
    .neq("user_id", order.seekerUserId);
  if (options.only) query = query.eq("id", options.only);
  const { data: providers } = await query;

  const exclude = new Set(options.exclude ?? []);
  const offeringService = (providers ?? []).filter((p) => {
    if (exclude.has(p.id)) return false;
    const a = (p.attributes ?? {}) as Record<string, unknown>;
    const offered = jobs ? a.trades : a.errandServices;
    return (Array.isArray(offered) ? offered : []).includes(order.service);
  });
  if (offeringService.length === 0) return [];

  // Where riders are now (deliveries only: tradespeople don't share it).
  const live = jobs ? new Map<string, Point>() : await freshRiderPoints(db, offeringService.map((p) => p.id), options.freshMinutes ?? DEFAULT_SETTINGS.location_fresh_minutes);
  const rangeOf = (a: Record<string, unknown>) => (typeof a.maxDistanceKm === "number" && a.maxDistanceKm > 0 ? a.maxDistanceKm : DEFAULT_RIDER_RANGE_KM);

  const offering = offeringService.filter((p) => {
    const a = (p.attributes ?? {}) as Record<string, unknown>;
    const seekerPlace = { governorateId: pickupGovernorate, districtId: order.pickupDistrictId };
    // 1 = works in that district; 0.5 = same governorate but not that
    // district -- not "covering" it, so a delivery isn't sent; a repair job is.
    const score = placeScore(seekerPlace, placeOf(p as { location_id: string | null; attributes: Record<string, unknown> }));
    if (jobs) return score > 0;
    // Picked by the customer: where they work doesn't matter.
    if (options.anywhere || options.only) return true;
    const hasDistrict = typeof a.districtId === "string";
    const here = live.get(p.id);
    // Who is really close is decided by distance below.
    if (options.nearbyKm !== undefined) return hasDistrict || !!here;
    const covers = hasDistrict ? score === 1 : score > 0;
    const inRange = !!here && !!pickupPoint && distanceKm(pickupPoint, here) <= rangeOf(a);
    return covers || inRange;
  });
  if (offering.length === 0) return [];

  const userIds = [...new Set(offering.map((p) => p.user_id))];
  const profileIds = offering.map((p) => p.id);
  const [{ data: users }, load] = await Promise.all([
    db.from("users").select("id, status").in("id", userIds),
    jobs ? Promise.resolve(new Map<string, number>()) : activeOrderCounts(db, profileIds),
  ]);
  const suspended = new Set((users ?? []).filter((u) => u.status === "suspended").map((u) => u.id));
  const maxActive = options.maxActive ?? 1;
  const free = offering.filter((p) => !suspended.has(p.user_id) && (load.get(p.id) ?? 0) < maxActive);

  const attr = (p: (typeof free)[number], key: string) => {
    const v = ((p.attributes ?? {}) as Record<string, unknown>)[key];
    return typeof v === "string" ? v : null;
  };
  const [points, misses] = await Promise.all([
    pointsById(db, free.flatMap((p) => [attr(p, "areaId"), attr(p, "districtId"), p.location_id])),
    jobs ? Promise.resolve(new Map<string, number>()) : missRates(db, free.map((p) => p.id)),
  ]);
  const ranked = free.map((p) => {
    const home = points.get(attr(p, "areaId") ?? "") ?? points.get(attr(p, "districtId") ?? "") ?? points.get(p.location_id ?? "");
    const at = live.get(p.id) ?? home ?? null;
    const km = pickupPoint && at ? distanceKm(pickupPoint, at) : null;
    const penalty = (misses.get(p.id) ?? 0) * MISS_PENALTY_KM + (!jobs && !p.available_now ? OFFLINE_PENALTY_KM : 0);
    return { profileId: p.id, userId: p.user_id, distanceKm: km, point: at ? { lat: at.lat, lon: at.lon } : null, live: live.has(p.id), rank: km === null ? Infinity : km + penalty };
  });
  // Unknown distances last; ties broken by id so the order is stable.
  ranked.sort((a, b) => a.rank - b.rank || a.profileId.localeCompare(b.profileId));
  const reach = options.nearbyKm;
  const within = reach === undefined ? ranked : ranked.filter((r) => r.distanceKm !== null && r.distanceKm <= reach);
  return within.slice(0, options.limit).map((c) => ({ profileId: c.profileId, userId: c.userId, distanceKm: c.distanceKm, point: c.point, live: c.live }));
}

export type OrderActor = { userId: string | null; role: "seeker" | "provider" | "admin" | "system" };
const SYSTEM: OrderActor = { userId: null, role: "system" };

export async function logOrderEvent(db: Admin, orderId: string, actor: OrderActor, type: string, detail: Record<string, unknown> = {}) {
  await db.from("errand_order_events").insert({
    order_id: orderId,
    actor_user_id: actor.userId,
    actor_role: actor.role,
    type,
    detail: detail as { [key: string]: string | number | boolean | null },
  });
}

const orderPayload = (order: OrderRow, extra: Record<string, unknown> = {}) => ({
  order_id: order.id,
  order_number: order.number,
  category_slug: order.category,
  ...extra,
});

/**
 * Sends the order on to more providers and notifies them; returns how many
 * received it. A delivery goes out in waves (sendWave); a repair request
 * goes to every eligible tradesperson at once, up to max_recipients. Used
 * when an order is created, when matching moves on, when the customer
 * retries, and when an admin steps in.
 */
export async function dispatchOrder(db: Admin, order: OrderRow, actor: OrderActor, options: { widen?: boolean } = {}): Promise<number> {
  if (order.category !== "maintenance") return sendWave(db, order, actor, options);

  const settings = await errandSettings(db);
  const { data: already } = await db.from("errand_order_recipients").select("provider_profile_id, rank").eq("order_id", order.id);
  const candidates = await eligibleProviders(
    db,
    {
      category: order.category,
      service: order.service as OrderService,
      pickupDistrictId: order.pickup_district_id,
      pickupAreaId: order.pickup_area_id,
      seekerUserId: order.seeker_user_id,
      pickupPoint: order.pickup_lat !== null && order.pickup_lng !== null ? { lat: order.pickup_lat, lng: order.pickup_lng } : null,
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
      payload: { order_id: order.id, order_number: order.number, service: order.service, category_slug: order.category },
    })),
  );
  return candidates.length;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The next wave of a delivery: the nearest `wave_size` eligible providers
 * not yet sent it, within the current radius. When nobody is left inside,
 * the radius widens by `radius_step_km` until someone is (or it reaches
 * `max_radius_km`). `widen` widens it one step first (an admin asking to
 * search further). Providers whose distance is unknown are only reached
 * at the widest radius.
 *
 * The wave is claimed with a conditional update on the wave number, so two
 * ticks at the same moment can't both send it.
 */
async function sendWave(db: Admin, order: OrderRow, actor: OrderActor, options: { widen?: boolean } = {}): Promise<number> {
  const settings = await errandSettings(db);
  const { data: already } = await db.from("errand_order_recipients").select("provider_profile_id, rank").eq("order_id", order.id);
  const room = settings.max_recipients - (already ?? []).length;
  const wave = order.wave + 1;
  if (room <= 0) {
    await logOrderEvent(db, order.id, actor, "wave_sent", { wave, count: 0, reason: "max_recipients" });
    return 0;
  }

  const asked = {
    category: order.category,
    service: order.service as OrderService,
    pickupDistrictId: order.pickup_district_id,
    pickupAreaId: order.pickup_area_id,
    seekerUserId: order.seeker_user_id,
    pickupPoint: order.pickup_lat !== null && order.pickup_lng !== null ? { lat: order.pickup_lat, lng: order.pickup_lng } : null,
  };
  const reach = {
    exclude: (already ?? []).map((r) => r.provider_profile_id),
    limit: Infinity,
    maxActive: settings.max_active_orders,
    freshMinutes: settings.location_fresh_minutes,
  };
  const chosen = order.chosen_provider_profile_id;
  const candidates = chosen ? [] : await eligibleProviders(db, asked, reach);

  const max = settings.max_radius_km;
  const before = order.radius_km !== null ? Number(order.radius_km) : null;
  let radius = Math.min(max, before ?? settings.initial_radius_km);
  if (options.widen && before !== null) radius = Math.min(max, round1(radius + settings.radius_step_km));
  const inside = (c: Candidate, r: number) => (c.distanceKm !== null ? c.distanceKm <= r : r >= max);
  while (radius < max && candidates.length > 0 && !candidates.some((c) => inside(c, radius))) {
    radius = Math.min(max, round1(radius + settings.radius_step_km));
  }
  const size = Math.min(settings.wave_size, room);
  const pickupAt = asked.pickupPoint ? { lat: asked.pickupPoint.lat, lon: asked.pickupPoint.lng } : null;
  // Among the nearest few inside the radius, the quickest by road go first.
  // Each lookup is booked against the day's cap first; past it, straight lines.
  const book = async (elements: number) =>
    (await db.rpc("use_travel_time", { p_elements: elements, p_limit: settings.travel_time_daily_limit })).data === true;
  let road = await quickestByRoad(candidates.filter((c) => inside(c, radius)), size, pickupAt, settings.travel_time_candidates, book);
  let batch = road.picked;
  // Nobody covering the district is left: available riders close to the
  // pickup, even across a district line, before telling the customer no.
  const nearby = batch.length === 0 && settings.nearby_fallback_km > 0 && !chosen;
  if (chosen) {
    // The rider the customer picked, and only them: once they've passed
    // (a later wave), it ends; Try again sends a copy to everyone.
    batch = order.wave === 0 ? await eligibleProviders(db, asked, { ...reach, limit: 1, only: chosen }) : [];
  } else if (nearby) {
    road = await quickestByRoad(await eligibleProviders(db, asked, { ...reach, nearbyKm: settings.nearby_fallback_km }), size, pickupAt, settings.travel_time_candidates, book);
    batch = road.picked;
  }
  if (batch.length === 0) {
    await logOrderEvent(db, order.id, actor, "wave_sent", { wave, count: 0, radius_km: radius });
    return 0;
  }

  const { data: claimed } = await db
    .from("errand_orders")
    .update({ wave, wave_until: inSeconds(settings.response_seconds), radius_km: radius, choose_until: null })
    .eq("id", order.id)
    .eq("wave", order.wave)
    .eq("status", "open")
    .select("id");
  // Someone else sent this wave (or the order moved on) a moment ago.
  if (!claimed?.length) return batch.length;

  const start = Math.max(0, ...(already ?? []).map((r) => r.rank));
  const { error } = await db.from("errand_order_recipients").insert(
    batch.map((c, i) => ({
      order_id: order.id,
      provider_profile_id: c.profileId,
      provider_user_id: c.userId,
      distance_km: c.distanceKm,
      rank: start + i + 1,
      wave,
    })),
  );
  if (error) {
    console.error("[errand-orders] wave failed:", error.message);
    return 0;
  }
  await logOrderEvent(db, order.id, actor, "wave_sent", {
    wave,
    count: batch.length,
    radius_km: radius,
    ...(nearby ? { nearby_km: settings.nearby_fallback_km } : {}),
    ...(chosen ? { chosen: true } : {}),
    ...(before !== null && radius > before ? { widened_from_km: before } : {}),
    providers: batch.map((c) => ({
      profile_id: c.profileId,
      distance_km: c.distanceKm,
      ...(c.live ? { live: true } : {}),
      ...(road.minutes.has(c) ? { drive_minutes: road.minutes.get(c)! } : {}),
    })),
  });
  await notify(
    batch.map((c) => ({
      user_id: c.userId,
      type: "errand_request",
      payload: {
        order_id: order.id,
        order_number: order.number,
        service: order.service,
        category_slug: order.category,
        respond_seconds: settings.response_seconds,
      },
    })),
  );
  return batch.length;
}

/**
 * Closes an open order as "no provider" and tells the customer (unless
 * `quiet`: they're looking at the answer on screen). Only if it's still
 * where the caller saw it -- same wave, still open.
 */
async function closeNoProvider(db: Admin, order: OrderRow, reason: string, options: { quiet?: boolean } = {}) {
  const { data } = await db
    .from("errand_orders")
    .update({ status: "no_provider", status_changed_at: new Date().toISOString(), cancelled_by: "system", choose_until: null })
    .eq("id", order.id)
    .eq("status", "open")
    .eq("wave", order.wave)
    .select("id");
  if (!data?.length) return false;
  await db.from("errand_order_recipients").update({ status: "expired" }).eq("order_id", order.id).eq("status", "sent");
  await db.from("errand_order_recipients").update({ status: "offer_expired" }).eq("order_id", order.id).eq("status", "offered");
  await logOrderEvent(db, order.id, SYSTEM, "status", { status: "no_provider", reason });
  if (!options.quiet) await notify({ user_id: order.seeker_user_id, type: "errand_no_provider", payload: orderPayload(order) });
  return true;
}

/** Sends the next wave; with nobody left to ask, closes the order as "no provider". */
export async function nextWaveOrClose(db: Admin, order: OrderRow, actor: OrderActor = SYSTEM, options: { quiet?: boolean } = {}) {
  const sent = await dispatchOrder(db, order, actor);
  if (sent > 0) return sent;
  await closeNoProvider(db, order, "no_one_left", options);
  return 0;
}

const isPast = (iso: string | null) => iso !== null && Date.parse(iso) <= Date.now();

/**
 * Riders who just let a request run out: one who has now missed
 * errand_settings.auto_offline_after_misses in a row since they last went
 * Available is switched Offline and told why, so customers stop waiting on
 * someone who isn't looking. Answering anything (an offer or "Not for me")
 * breaks the run; switching back on starts a new one.
 */
export async function offlineUnresponsive(db: Admin, profileIds: string[], order: OrderRow): Promise<string[]> {
  const settings = await errandSettings(db);
  const limit = settings.auto_offline_after_misses;
  if (limit <= 0 || profileIds.length === 0) return [];
  const { data: riders } = await db
    .from("generic_profiles")
    .select("id, user_id, available_now, available_changed_at")
    .in("id", profileIds)
    .eq("available_now", true);
  const switched: string[] = [];
  for (const rider of riders ?? []) {
    let recent = db
      .from("errand_order_recipients")
      .select("status")
      .eq("provider_profile_id", rider.id)
      .neq("status", "sent")
      .order("sent_at", { ascending: false })
      .limit(limit);
    if (rider.available_changed_at) recent = recent.gte("sent_at", rider.available_changed_at);
    const { data: rows } = await recent;
    if ((rows ?? []).length < limit || !(rows ?? []).every((r) => r.status === "expired")) continue;
    const { data: off } = await db
      .from("generic_profiles")
      .update({ available_now: false, available_changed_at: new Date().toISOString() })
      .eq("id", rider.id)
      .eq("available_now", true)
      .select("id");
    if (!off?.length) continue;
    switched.push(rider.id);
    await db.from("rider_locations").delete().eq("profile_id", rider.id);
    await logOrderEvent(db, order.id, SYSTEM, "rider_auto_offline", { provider_profile_id: rider.id, missed: limit });
    await notify({ user_id: rider.user_id, type: "errand_status", payload: { status: "auto_offline", missed: limit, category_slug: "errands" } });
  }
  return switched;
}

async function fresh(db: Admin, id: string) {
  const { data } = await db.from("errand_orders").select("*").eq("id", id).maybeSingle();
  return data;
}

/**
 * Puts an order back to open for offers, without the provider it was
 * reserved for (or given to). If other offers still stand, the customer
 * gets a fresh window to choose one; otherwise matching carries on with
 * the next wave. Returns false if the order wasn't in `from` any more.
 */
export async function reopenOrder(db: Admin, order: OrderRow, from: OrderStatus[], actor: OrderActor): Promise<boolean> {
  const settings = await errandSettings(db);
  const delivery = order.category !== "maintenance";
  const { count: standing } = await db
    .from("errand_order_recipients")
    .select("id", { count: "exact", head: true })
    .eq("order_id", order.id)
    .eq("status", "offered")
    .neq("id", order.selected_recipient_id ?? "00000000-0000-0000-0000-000000000000");
  const { data } = await db
    .from("errand_orders")
    .update({
      status: "open",
      status_changed_at: new Date().toISOString(),
      provider_profile_id: null,
      provider_user_id: null,
      selected_recipient_id: null,
      confirm_until: null,
      choose_until: delivery && (standing ?? 0) > 0 ? inSeconds(settings.choose_seconds) : null,
      open_until: new Date(Date.now() + openMinutesFor(settings, order.category) * 60_000).toISOString(),
    })
    .eq("id", order.id)
    .in("status", from)
    .select("*");
  const reopened = data?.[0];
  if (!reopened) return false;
  await logOrderEvent(db, order.id, actor, "status", { status: "open" });
  if (delivery) {
    await tickOrder(db, reopened);
  } else {
    // A repair request: if nobody is left who might still quote, ask more.
    const { data: rows } = await db.from("errand_order_recipients").select("status").eq("order_id", order.id);
    if (!(rows ?? []).some((r) => r.status === "sent" || r.status === "offered")) await nextWaveOrClose(db, reopened);
  }
  return true;
}

/**
 * Moves one delivery on once a deadline has passed (or everyone has
 * answered). Safe to call any time, from any number of places at once:
 * every step is a conditional update, so only one caller makes it.
 *
 * - reserved, confirm time up   -> the reservation lapses; matching carries on.
 * - open, past open_until       -> closes as "no provider".
 * - choosing, time up           -> the offers lapse; the next wave goes out.
 * - wave time up, or all answered:
 *     the ones who didn't answer are marked "expired", then
 *     offers in -> the customer's choosing window starts;
 *     no offers -> the next wave (or "no provider").
 */
export async function tickOrder(db: Admin, order: OrderRow): Promise<void> {
  if (order.category === "maintenance") {
    if (order.status === "open" && isPast(order.open_until)) await closeNoProvider(db, order, "expired");
    return;
  }

  if (order.status === "reserved") {
    if (!isPast(order.confirm_until)) return;
    const recipientId = order.selected_recipient_id;
    const providerUserId = order.provider_user_id;
    const providerProfileId = order.provider_profile_id;
    // Only the first caller to see this deadline lapses it.
    const { data: claimed } = await db
      .from("errand_orders")
      .update({ confirm_until: null })
      .eq("id", order.id)
      .eq("status", "reserved")
      .eq("confirm_until", order.confirm_until!)
      .select("id");
    if (!claimed?.length) return;
    await logOrderEvent(db, order.id, SYSTEM, "confirm_timeout", { provider_profile_id: providerProfileId });
    if (recipientId) await db.from("errand_order_recipients").update({ status: "refused" }).eq("id", recipientId);
    if (!(await reopenOrder(db, { ...order, confirm_until: null }, ["reserved"], SYSTEM))) return;
    if (providerUserId) await notify({ user_id: providerUserId, type: "errand_status", payload: orderPayload(order, { status: "missed" }) });
    await notify({ user_id: order.seeker_user_id, type: "errand_status", payload: orderPayload(order, { status: "refused" }) });
    return;
  }

  if (order.status !== "open") return;
  if (isPast(order.open_until)) {
    await closeNoProvider(db, order, "expired");
    return;
  }

  if (order.choose_until) {
    if (!isPast(order.choose_until)) {
      // Still choosing -- unless every offer has since been withdrawn.
      const { count } = await db
        .from("errand_order_recipients")
        .select("id", { count: "exact", head: true })
        .eq("order_id", order.id)
        .eq("status", "offered");
      if ((count ?? 0) > 0) return;
    }
    // The customer didn't choose in time (or nothing is left to choose): those offers lapse.
    await db.from("errand_order_recipients").update({ status: "offer_expired" }).eq("order_id", order.id).eq("status", "offered");
    await db.from("errand_order_recipients").update({ status: "expired" }).eq("order_id", order.id).eq("status", "sent");
    const { data: won } = await db
      .from("errand_orders")
      .update({ choose_until: null })
      .eq("id", order.id)
      .eq("status", "open")
      .eq("choose_until", order.choose_until)
      .select("*");
    if (!won?.[0]) return;
    await logOrderEvent(db, order.id, SYSTEM, "offers_expired");
    await nextWaveOrClose(db, won[0]);
    return;
  }

  const { data: rows } = await db.from("errand_order_recipients").select("status").eq("order_id", order.id);
  const pending = (rows ?? []).filter((r) => r.status === "sent").length;
  const windowOver = order.wave === 0 || isPast(order.wave_until);
  if (!windowOver && pending > 0) return;

  if (pending > 0) {
    const { data: lapsed } = await db
      .from("errand_order_recipients")
      .update({ status: "expired" })
      .eq("order_id", order.id)
      .eq("status", "sent")
      .select("provider_profile_id");
    if (lapsed?.length) {
      await logOrderEvent(db, order.id, SYSTEM, "no_response", { wave: order.wave, providers: lapsed.map((r) => r.provider_profile_id) });
      await offlineUnresponsive(db, lapsed.map((r) => r.provider_profile_id), order);
    }
  }

  if ((rows ?? []).some((r) => r.status === "offered")) {
    const settings = await errandSettings(db);
    const until = inSeconds(settings.choose_seconds);
    const { data: started } = await db
      .from("errand_orders")
      .update({ choose_until: until })
      .eq("id", order.id)
      .eq("status", "open")
      .eq("wave", order.wave)
      .is("choose_until", null)
      .select("id");
    if (started?.length) {
      await logOrderEvent(db, order.id, SYSTEM, "choosing", { until });
      // A nudge when the wave's time ran out (the offers lapse if they don't
      // pick one) -- not right after an answer, which already notified them.
      if (isPast(order.wave_until)) {
        await notify({ user_id: order.seeker_user_id, type: "errand_status", payload: orderPayload(order, { status: "choose" }) });
      }
    }
    return;
  }

  await nextWaveOrClose(db, order);
}

/**
 * Moves on every order (or the given ones) with a deadline that has
 * passed. Called whenever orders are read -- the customer's screen checks
 * every few seconds -- and from /api/cron/errand-orders, so orders keep
 * moving when nobody is looking.
 */
export async function advanceOrders(db: Admin, filter: { seekerUserId?: string; orderId?: string; orderIds?: string[] } = {}): Promise<number> {
  if (filter.orderIds && filter.orderIds.length === 0) return 0;
  const now = new Date().toISOString();
  let query = db
    .from("errand_orders")
    .select("*")
    // Each state has its own deadline: an open order its time limits, a
    // reserved one the provider's confirmation.
    .or(`and(status.eq.open,or(open_until.lt.${now},wave_until.lt.${now},choose_until.lt.${now})),and(status.eq.reserved,confirm_until.lt.${now})`)
    .order("created_at")
    .limit(200);
  if (filter.seekerUserId) query = query.eq("seeker_user_id", filter.seekerUserId);
  if (filter.orderId) query = query.eq("id", filter.orderId);
  if (filter.orderIds) query = query.in("id", filter.orderIds);
  const { data } = await query;
  for (const order of data ?? []) {
    try {
      await tickOrder(db, order);
    } catch (e) {
      console.error("[errand-orders] tick failed for", order.id, e);
    }
  }
  return (data ?? []).length;
}

/** Re-reads an order and moves it on if it's due; returns the up-to-date row. */
export async function advancedOrder(db: Admin, id: string) {
  await advanceOrders(db, { orderId: id });
  return fresh(db, id);
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
