import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { errandSettings, eligibleProviders } from "@/lib/errand-orders";
import { orderPeople } from "@/lib/errand-order-view";
import { placeOfPoint } from "@/lib/nearest-place";
import { ERRAND_SERVICES, type ErrandService } from "@/lib/validation/errands";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The riders a customer can send this order to themselves: available now,
 * offering the service and free to take it, wherever they work, nearest
 * to the pickup first. ?service=&lat=&lng= (a point on the map) or
 * ?service=&districtId=&areaId=.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const q = new URL(request.url).searchParams;
  const service = q.get("service") ?? "";
  if (!(ERRAND_SERVICES as readonly string[]).includes(service)) return NextResponse.json({ riders: [] });
  const lat = Number(q.get("lat"));
  const lng = Number(q.get("lng"));
  const point = q.has("lat") && q.has("lng") && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  let districtId = q.get("districtId");
  let areaId = q.get("areaId");
  if (point) ({ districtId, areaId } = (await placeOfPoint(point)) ?? { districtId: null, areaId: null });
  if (!districtId || !UUID.test(districtId)) return NextResponse.json({ riders: [] });
  if (areaId && !UUID.test(areaId)) areaId = null;

  const db = createAdminClient();
  const settings = await errandSettings(db);
  const found = await eligibleProviders(
    db,
    { service: service as ErrandService, pickupDistrictId: districtId, pickupAreaId: areaId, seekerUserId: user.id, pickupPoint: point },
    { limit: 40, maxActive: settings.max_active_orders, anywhere: true },
  );
  const people = await orderPeople(db, found.map((r) => r.profileId));
  const riders = found.flatMap((r) => {
    const p = people.get(r.profileId);
    return p ? [{ profileId: p.profileId, name: p.name, photoUrl: p.photoUrl, rating: p.rating, distanceKm: r.distanceKm === null ? null : Math.round(r.distanceKm * 10) / 10 }] : [];
  });
  return NextResponse.json({ riders });
}
