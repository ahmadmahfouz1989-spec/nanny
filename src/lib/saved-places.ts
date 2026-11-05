import { createAdminClient } from "@/lib/supabase/admin";
import { straightLineKm, type LatLng } from "@/lib/place-input";

type Admin = ReturnType<typeof createAdminClient>;

export const SAVED_KINDS = ["home", "work"] as const;
export type SavedKind = (typeof SAVED_KINDS)[number];

export type SavedPlace = { id: string; kind: SavedKind | "recent"; point: LatLng; address: string | null; name: string | null };

const RECENT_LIMIT = 5;
/** Closer than this to a recent place is the same place. */
const SAME_PLACE_KM = 0.05;

/** Home and Work first, then recents, newest first. Empty if anything goes wrong: search still works. */
export async function savedPlaces(db: Admin, userId: string): Promise<SavedPlace[]> {
  const { data, error } = await db
    .from("saved_places")
    .select("id, kind, lat, lng, address, name")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(RECENT_LIMIT + SAVED_KINDS.length);
  if (error) return [];
  const rank = (kind: string) => (kind === "home" ? 0 : kind === "work" ? 1 : 2);
  return (data ?? [])
    .map((r) => ({ id: r.id, kind: r.kind as SavedPlace["kind"], point: { lat: r.lat, lng: r.lng }, address: r.address, name: r.name }))
    .sort((a, b) => rank(a.kind) - rank(b.kind));
}

/** Remembers the places of an order; never fails the order. */
export async function rememberRecentPlaces(db: Admin, userId: string, places: { point: LatLng | null | undefined; address?: string | null; name?: string | null }[]) {
  try {
    const known = await savedPlaces(db, userId);
    const recents = known.filter((p) => p.kind === "recent");
    for (const place of places) {
      if (!place.point) continue;
      const point = place.point;
      // Already Home or Work: nothing to add.
      if (known.some((p) => p.kind !== "recent" && straightLineKm(p.point, point) < SAME_PLACE_KM)) continue;
      const same = recents.filter((p) => straightLineKm(p.point, point) < SAME_PLACE_KM);
      if (same.length) await db.from("saved_places").delete().in("id", same.map((p) => p.id));
      await db.from("saved_places").insert({ user_id: userId, kind: "recent", lat: point.lat, lng: point.lng, address: place.address || null, name: place.name || null });
    }
    const { data: now } = await db.from("saved_places").select("id").eq("user_id", userId).eq("kind", "recent").order("updated_at", { ascending: false });
    const extra = (now ?? []).slice(RECENT_LIMIT).map((r) => r.id);
    if (extra.length) await db.from("saved_places").delete().in("id", extra);
  } catch (e) {
    console.error("[saved-places] recent places not saved:", e);
  }
}
