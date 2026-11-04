import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceOrders } from "@/lib/errand-orders";

/**
 * Moves on every delivery order whose deadline has passed: the next wave
 * when providers didn't answer, the customer's choice running out, a
 * provider not confirming in time. Orders also move on whenever someone
 * looks at them; this keeps them moving when nobody does.
 *
 * Call it every 30-60 seconds with `Authorization: Bearer $CRON_SECRET`
 * (a Supabase pg_cron + pg_net job, or any external cron).
 */
async function run(request: Request) {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  const given = Buffer.from(request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "");
  const expected = Buffer.from(secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const moved = await advanceOrders(createAdminClient());
  return NextResponse.json({ ok: true, moved });
}

export const GET = run;
export const POST = run;
