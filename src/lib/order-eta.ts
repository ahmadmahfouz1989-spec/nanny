import type { createAdminClient } from "@/lib/supabase/admin";
import { distanceKm, errandSettings } from "@/lib/errand-orders";
import { roadMinutes, travelTimesEnabled } from "@/lib/travel-time";

// When a delivery gets there, for the customer: from the rider's live
// position by road (Google, with traffic) where we can, else by distance,
// else from the time the rider gave when they took the order.

type Admin = ReturnType<typeof createAdminClient>;
type Point = { lat: number; lng: number };

export type OrderEta = {
  /** Until the rider is at the pickup (0 = there now); null once picked up or unknown. */
  pickupMinutes: number | null;
  /** Until the drop-off; null without one, or when unknown. */
  dropoffMinutes: number | null;
  /** live = the rider's position; offer = only the time the rider said. */
  basis: "live" | "offer";
};

/** Waiting at the pickup: the shop, the queue, loading up. */
export const PICKUP_STOP_MINUTES = 5;
/** Straight lines to road time: Lebanese roads wind, and towns are slow. */
const ROAD_FACTOR = 1.4;
const KMH = 25;
/** How long a road time is reused before asking Google again. */
const RIDER_CACHE_MS = 60_000;
const LEG_CACHE_MS = 30 * 60_000;

const cache = new Map<string, { minutes: number; until: number }>();

const km = (a: Point, b: Point) => distanceKm({ lat: a.lat, lon: a.lng }, { lat: b.lat, lon: b.lng });

/** Minutes by distance alone: 0 when right there. */
export function minutesByDistance(from: Point, to: Point): number {
  const d = km(from, to);
  if (d < 0.15) return 0;
  return Math.max(1, Math.ceil(((d * ROAD_FACTOR) / KMH) * 60));
}

/** Road minutes, kept a while per key; distance when Google can't (no key, cap, no answer). */
async function travel(db: Admin, key: string, from: Point, to: Point, keepMs: number): Promise<number> {
  if (km(from, to) < 0.15) return 0;
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.until > now) return hit.minutes;
  let minutes: number | null = null;
  if (travelTimesEnabled()) {
    const settings = await errandSettings(db);
    const { data: allowed } = await db.rpc("use_travel_time", { p_elements: 1, p_limit: settings.travel_time_daily_limit });
    if (allowed === true) minutes = (await roadMinutes([{ lat: from.lat, lon: from.lng }], { lat: to.lat, lon: to.lng }))?.[0] ?? null;
  }
  // Only Google's answers are worth keeping; distance is free to redo.
  if (minutes !== null) {
    if (cache.size > 2000) cache.clear();
    cache.set(key, { minutes, until: now + keepMs });
    return minutes;
  }
  return minutesByDistance(from, to);
}

const minutesSince = (iso: string | null | undefined) => (iso ? (Date.now() - Date.parse(iso)) / 60_000 : null);

export async function orderEta(
  db: Admin,
  input: {
    orderId: string;
    status: string;
    pickup: Point | null;
    dropoff: Point | null;
    rider: Point | null;
    /** The minutes the rider offered, and when they were confirmed. */
    offeredMinutes: number | null;
    confirmedAt: string | null;
    pickedUpAt: string | null;
  },
): Promise<OrderEta | null> {
  const { orderId, status, pickup, dropoff, rider } = input;
  if (!["accepted", "on_the_way", "arrived", "picked_up"].includes(status)) return null;
  // Pickup to drop-off, the second half of the trip.
  const leg = pickup && dropoff ? await travel(db, `leg:${orderId}`, pickup, dropoff, LEG_CACHE_MS) : null;
  const thenDropoff = (toPickup: number | null) => (toPickup !== null && leg !== null ? toPickup + PICKUP_STOP_MINUTES + leg : null);

  if (rider) {
    if (status === "picked_up") {
      return { pickupMinutes: null, dropoffMinutes: dropoff ? await travel(db, `rider:${orderId}:drop`, rider, dropoff, RIDER_CACHE_MS) : null, basis: "live" };
    }
    const toPickup = status === "arrived" ? 0 : pickup ? await travel(db, `rider:${orderId}:pick`, rider, pickup, RIDER_CACHE_MS) : null;
    return { pickupMinutes: toPickup, dropoffMinutes: thenDropoff(toPickup), basis: "live" };
  }

  // No live position: count down what the rider said, then the road time.
  if (status === "picked_up") {
    const gone = minutesSince(input.pickedUpAt);
    const left = leg !== null && gone !== null ? Math.ceil(leg - gone) : null;
    return left !== null && left > 0 ? { pickupMinutes: null, dropoffMinutes: left, basis: "offer" } : null;
  }
  if (status === "arrived") return { pickupMinutes: 0, dropoffMinutes: thenDropoff(0), basis: "offer" };
  const gone = minutesSince(input.confirmedAt);
  const left = input.offeredMinutes !== null && gone !== null ? Math.ceil(input.offeredMinutes - gone) : null;
  // Past the time they gave, a number would only be a guess.
  if (left === null || left <= 0) return null;
  return { pickupMinutes: left, dropoffMinutes: thenDropoff(left), basis: "offer" };
}
