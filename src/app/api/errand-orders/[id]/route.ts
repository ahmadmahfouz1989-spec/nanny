import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { closeExpiredOrders } from "@/lib/errand-orders";
import { orderView } from "@/lib/errand-order-view";

/**
 * One order, as the caller is allowed to see it: the customer who placed
 * it, or a provider it was sent to (or who is doing it). Anyone else gets
 * 404, the same as an order that doesn't exist.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createAdminClient();
  await closeExpiredOrders(db, { orderId: id });
  const { data: order } = await db.from("errand_orders").select("*").eq("id", id).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (order.seeker_user_id === user.id) return NextResponse.json({ order: await orderView(db, order, "seeker", user.id) });

  const { data: mine } = await db
    .from("errand_order_recipients")
    .select("id")
    .eq("order_id", id)
    .eq("provider_user_id", user.id)
    .maybeSingle();
  if (mine || order.provider_user_id === user.id) return NextResponse.json({ order: await orderView(db, order, "provider", user.id) });

  return NextResponse.json({ error: "Order not found" }, { status: 404 });
}
