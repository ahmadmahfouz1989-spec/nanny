import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { BUSY_STATUSES, distanceKm, logOrderEvent, type OrderStatus } from "@/lib/errand-orders";
import { notify } from "@/lib/push";
import { readTrackingToken } from "@/lib/tracking-token";

/** "Almost there" goes out once the rider is this close to where the customer waits. */
const NEAR_KM = 1;

const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).optional(),
  // From the apps in the background: the delivery's tracking key instead of the login cookie.
  token: z.string().max(300).optional(),
});

/**
 * Where the rider doing this delivery is, sent every ~15 s from their order
 * page (LiveTracking) so the customer can follow them on the map. Only the
 * assigned rider, only while the order is in progress; the row goes when it
 * isn't (errand_orders_stop_tracking).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });
  // Who's sending: the tracking key (apps, in the background) or the login.
  let userId = parsed.data.token ? readTrackingToken(parsed.data.token, id) : null;
  if (!userId) {
    const user = await requireActiveUser(await createClient());
    if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    userId = user.id;
  }

  const db = createAdminClient();
  const { data: order } = await db.from("errand_orders").select("id, number, provider_user_id, seeker_user_id, status, category, service, pickup_lat, pickup_lng, dropoff_lat, dropoff_lng").eq("id", id).maybeSingle();
  if (!order || order.provider_user_id !== userId || order.category !== "errands") return NextResponse.json({ error: "Not your delivery" }, { status: 403 });
  if (!BUSY_STATUSES.includes(order.status as OrderStatus)) return NextResponse.json({ ok: false, reason: "not_active" });

  const { error } = await db.from("errand_order_tracking").upsert({
    order_id: id,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    accuracy_m: parsed.data.accuracy ?? null,
    located_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Where the customer is waiting: the drop-off once it's picked up, or
  // the pickup for a ride (the passenger). Told once per leg.
  const leg = order.status === "picked_up" ? "dropoff" : order.service === "moto_taxi" && ["accepted", "on_the_way"].includes(order.status) ? "pickup" : null;
  const lat = leg === "dropoff" ? order.dropoff_lat : order.pickup_lat;
  const lng = leg === "dropoff" ? order.dropoff_lng : order.pickup_lng;
  if (leg && lat !== null && lng !== null && distanceKm({ lat: parsed.data.lat, lon: parsed.data.lng }, { lat, lon: lng }) <= NEAR_KM) {
    const { count } = await db.from("errand_order_events").select("id", { count: "exact", head: true }).eq("order_id", id).eq("type", "near").contains("detail", { leg });
    if (!count) {
      await logOrderEvent(db, id, { userId, role: "provider" }, "near", { leg });
      await notify({ user_id: order.seeker_user_id, type: "errand_status", payload: { order_id: id, order_number: order.number, category_slug: order.category, status: "nearby" } });
    }
  }
  return NextResponse.json({ ok: true });
}
