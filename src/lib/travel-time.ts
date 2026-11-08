// Road travel times to a pickup, from Google's Routes API (route matrix).
// Straight lines mislead in Lebanon -- Beirut to Aley is ~12 km as the crow
// flies but ~40 min by road -- so a delivery wave is picked by driving time
// among the nearest few riders. Needs GOOGLE_MAPS_SERVER_KEY (a key without
// a website restriction, with the Routes API on); without it, or if Google
// is slow or says no, the caller keeps straight-line order.

const ENDPOINT = "https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix";
const TIMEOUT_MS = 2500;

type LatLng = { lat: number; lon: number };

export const travelTimesEnabled = () => !!process.env.GOOGLE_MAPS_SERVER_KEY;

/** Minutes by road from each origin to the destination; null where unknown. */
export async function roadMinutes(origins: LatLng[], destination: LatLng): Promise<(number | null)[] | null> {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key || origins.length === 0) return null;
  const waypoint = (p: LatLng) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lon } } } });
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": "originIndex,duration,condition",
      },
      // Motorbikes and cars both: DRIVE with live traffic is the closest fit.
      body: JSON.stringify({ origins: origins.map(waypoint), destinations: [waypoint(destination)], travelMode: "DRIVE", routingPreference: "TRAFFIC_AWARE" }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("[travel-time] routes matrix failed:", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const rows = (await res.json()) as { originIndex?: number; duration?: string; condition?: string }[];
    const out: (number | null)[] = origins.map(() => null);
    for (const row of rows) {
      if (row.condition !== "ROUTE_EXISTS" || !row.duration) continue;
      const seconds = Number.parseFloat(row.duration);
      if (Number.isFinite(seconds)) out[row.originIndex ?? 0] = Math.round(seconds / 60);
    }
    return out;
  } catch (e) {
    console.error("[travel-time] routes matrix error:", e);
    return null;
  }
}

/**
 * The `size` quickest to reach the pickup by road, from the first
 * `candidates` of an already nearest-first list. Unchanged order when
 * there's nothing to compare or no answer from Google.
 */
export async function quickestByRoad<T extends { point?: LatLng | null }>(
  list: T[],
  size: number,
  destination: LatLng | null,
  candidates: number,
  /** Reserves this many elements against the daily cap; false = over it, don't ask Google. */
  book: (elements: number) => Promise<boolean> = async () => true,
): Promise<{ picked: T[]; minutes: Map<T, number> }> {
  const minutes = new Map<T, number>();
  if (!destination || candidates <= 0 || list.length <= size || !travelTimesEnabled()) return { picked: list.slice(0, size), minutes };
  const pool = list.slice(0, Math.max(candidates, size)).filter((c) => c.point);
  if (pool.length === 0 || !(await book(pool.length))) return { picked: list.slice(0, size), minutes };
  const times = await roadMinutes(pool.map((c) => c.point!), destination);
  if (!times) return { picked: list.slice(0, size), minutes };
  pool.forEach((c, i) => {
    if (times[i] !== null) minutes.set(c, times[i]!);
  });
  // Known travel times first, quickest first; the rest keep their place.
  const order = [...list.slice(0, Math.max(candidates, size))].sort((a, b) => (minutes.get(a) ?? Infinity) - (minutes.get(b) ?? Infinity));
  return { picked: order.slice(0, size), minutes };
}
