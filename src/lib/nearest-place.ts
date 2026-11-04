import { createAdminClient } from "@/lib/supabase/admin";
import { distanceKm } from "@/lib/errand-orders";

// A point on the map -> the area and district it's in, as far as matching
// cares: the nearest of Lebanon's 1,610 areas (cadastres) by their
// centres. Areas are a few km across, so the nearest centre is the right
// one or a neighbour -- close enough for "which riders are near".

type Area = { id: string; districtId: string; lat: number; lon: number };

let cache: { at: number; areas: Area[] } | null = null;
const CACHE_MS = 6 * 60 * 60 * 1000;

async function areas(): Promise<Area[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.areas;
  const db = createAdminClient();
  const { data } = await db
    .from("locations")
    .select("id, parent_location_id, lat, lon")
    .eq("level", "area")
    .not("code", "is", null)
    .not("lat", "is", null)
    .limit(5000);
  const list = (data ?? [])
    .filter((r) => r.parent_location_id && r.lat !== null && r.lon !== null)
    .map((r) => ({ id: r.id, districtId: r.parent_location_id!, lat: r.lat!, lon: r.lon! }));
  cache = { at: Date.now(), areas: list };
  return list;
}

/** Further than this from every area centre is not in Lebanon (or at sea). */
const MAX_KM = 12;

/** The area and district a point is in, or null when it's not in Lebanon. */
export async function placeOfPoint(point: { lat: number; lng: number }): Promise<{ districtId: string; areaId: string } | null> {
  let best: Area | null = null;
  let bestKm = Infinity;
  for (const a of await areas()) {
    const km = distanceKm({ lat: point.lat, lon: point.lng }, a);
    if (km < bestKm) {
      bestKm = km;
      best = a;
    }
  }
  return best && bestKm <= MAX_KM ? { districtId: best.districtId, areaId: best.id } : null;
}
