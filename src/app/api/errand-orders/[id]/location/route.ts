import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { BUSY_STATUSES, type OrderStatus } from "@/lib/errand-orders";

const bodySchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).optional(),
});

/**
 * Where the rider doing this delivery is, sent every ~15 s from their order
 * page (LiveTracking) so the customer can follow them on the map. Only the
 * assigned rider, only while the order is in progress; the row goes when it
 * isn't (errand_orders_stop_tracking).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "lat and lng are required" }, { status: 400 });

  const db = createAdminClient();
  const { data: order } = await db.from("errand_orders").select("provider_user_id, status, category").eq("id", id).maybeSingle();
  if (!order || order.provider_user_id !== user.id || order.category !== "errands") return NextResponse.json({ error: "Not your delivery" }, { status: 403 });
  if (!BUSY_STATUSES.includes(order.status as OrderStatus)) return NextResponse.json({ ok: false, reason: "not_active" });

  const { error } = await db.from("errand_order_tracking").upsert({
    order_id: id,
    lat: parsed.data.lat,
    lng: parsed.data.lng,
    accuracy_m: parsed.data.accuracy ?? null,
    located_at: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
