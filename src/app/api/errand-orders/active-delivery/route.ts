import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { BUSY_STATUSES } from "@/lib/errand-orders";
import { makeTrackingToken } from "@/lib/tracking-token";

/**
 * The delivery this rider is doing right now, if any, with a key for
 * sending its live location (DeliveryTracker starts and stops on this).
 */
export async function GET() {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { data: order } = await createAdminClient()
    .from("errand_orders")
    .select("id")
    .eq("provider_user_id", user.id)
    .eq("category", "errands")
    .in("status", [...BUSY_STATUSES])
    .order("status_changed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!order) return NextResponse.json({ orderId: null });
  return NextResponse.json({ orderId: order.id, ...makeTrackingToken(order.id, user.id) });
}
