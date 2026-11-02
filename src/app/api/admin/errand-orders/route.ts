import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin/auth";
import { closeExpiredOrders, ORDER_STATUSES } from "@/lib/errand-orders";
import { orderSummaries } from "@/lib/errand-order-view";

/** Every Delivery & Errands order, newest first; `?status=` narrows it, `?number=` finds one by its Order ID. */
export async function GET(request: Request) {
  const supabase = await createClient();
  if (!(await requireAdmin(supabase))) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const db = createAdminClient();
  await closeExpiredOrders(db);
  const params = new URL(request.url).searchParams;
  const status = params.get("status");
  const number = Number(params.get("number"));
  let query = db.from("errand_orders").select("*").order("created_at", { ascending: false }).limit(100);
  if (status && (ORDER_STATUSES as readonly string[]).includes(status)) query = query.eq("status", status);
  if (Number.isInteger(number) && number > 0) query = query.eq("number", number);
  const { data } = await query;
  return NextResponse.json({ orders: await orderSummaries(db, data ?? []) });
}
