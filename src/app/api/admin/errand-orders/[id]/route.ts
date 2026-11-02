import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { closeExpiredOrders } from "@/lib/errand-orders";
import { orderView } from "@/lib/errand-order-view";
import { adminAction, ADMIN_ACTIONS } from "@/lib/errand-order-actions";

/** One order in full: every provider it went to and what they answered, and its whole history. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const db = createAdminClient();
  await closeExpiredOrders(db, { orderId: id });
  const { data: order } = await db.from("errand_orders").select("*").eq("id", id).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ order: await orderView(db, order, "admin", admin.userId) });
}

/** An admin steps in: `{ "action": "resend" | "reopen" | "cancel", "reason"? }`. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  const action = typeof body.action === "string" ? body.action : "";
  if (!(ADMIN_ACTIONS as readonly string[]).includes(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const db = createAdminClient();
  const { data: order } = await db.from("errand_orders").select("*").eq("id", id).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const result = await adminAction(db, order, { userId: admin.userId, role: "admin" }, action, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
