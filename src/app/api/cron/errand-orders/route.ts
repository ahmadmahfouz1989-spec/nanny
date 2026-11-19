import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { advanceOrders } from "@/lib/errand-orders";
import { sweepStaleCalls } from "@/lib/calls";

/**
 * Moves on every delivery order whose deadline has passed: the next wave
 * when providers didn't answer, the customer's choice running out, a
 * provider not confirming in time. Also turns calls whose caller's app
 * vanished mid-ring into missed calls (with the notification). Orders also move on whenever someone
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
  const db = createAdminClient();
  // The same tick closes calls that rang out with nobody to end them.
  const [moved, calls] = await Promise.all([advanceOrders(db), sweepStaleCalls(db)]);
  return NextResponse.json({ ok: true, moved, calls });
}

export const GET = run;
export const POST = run;
