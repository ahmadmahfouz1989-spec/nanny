import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { advancedOrder } from "@/lib/errand-orders";
import { orderView } from "@/lib/errand-order-view";
import { adminAction, ADMIN_ACTIONS } from "@/lib/errand-order-actions";

/** One order in full: every provider it went to and what they answered, and its whole history. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const db = createAdminClient();
  // Moves it on first if a deadline has passed (a wave's time, the choice, the confirmation).
  const order = await advancedOrder(db, id);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ order: await orderView(db, order, "admin", admin.userId) });
}

/**
 * An admin steps in: `{ "action": "resend" | "widen" | "reopen" | "cancel", "reason"? }`.
 * resend = send the next wave now; widen = one radius step further, then
 * send; reopen = restart matching for an order with no provider or one
 * stuck waiting for confirmation.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const admin = await requireAdmin(supabase);
  if (!admin) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const body = (await request.json().catch(() => ({}))) as { action?: unknown };
  const action = typeof body.action === "string" ? body.action : "";
  if (!(ADMIN_ACTIONS as readonly string[]).includes(action)) return NextResponse.json({ error: "Unknown action" }, { status: 400 });

  const db = createAdminClient();
  const order = await advancedOrder(db, id);
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const result = await adminAction(db, order, { userId: admin.userId, role: "admin" }, action, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ ok: true });
}
