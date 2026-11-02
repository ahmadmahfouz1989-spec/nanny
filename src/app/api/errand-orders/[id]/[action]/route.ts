import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { closeExpiredOrders } from "@/lib/errand-orders";
import { providerAction, seekerAction, PROVIDER_ACTIONS, SEEKER_ACTIONS } from "@/lib/errand-order-actions";

/**
 * A step on an order: the customer's (select, change, complete, cancel,
 * retry) or the provider's (offer, decline, withdraw, confirm, refuse,
 * advance, cancel). Who the caller is on this order decides which set
 * applies; see lib/errand-order-actions.ts.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const { id, action } = await params;
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createAdminClient();
  await closeExpiredOrders(db, { orderId: id });
  const { data: order } = await db.from("errand_orders").select("*").eq("id", id).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const isSeeker = order.seeker_user_id === user.id;
  if (isSeeker && !(SEEKER_ACTIONS as readonly string[]).includes(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  if (!isSeeker && !(PROVIDER_ACTIONS as readonly string[]).includes(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const result = isSeeker
    ? await seekerAction(db, order, { userId: user.id, role: "seeker" }, action, body)
    : await providerAction(db, order, { userId: user.id, role: "provider" }, action, body);

  if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
  return NextResponse.json({ ok: true, orderId: result.orderId ?? id });
}
