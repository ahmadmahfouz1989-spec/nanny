import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { myErrandProfiles } from "@/lib/errand-orders";

// About 500 m: enough to send the nearest rider, not enough to find a door.
const round = (n: number) => Math.round(n * 200) / 200;
const bodySchema = z.object({ lat: z.number().min(33).max(34.8), lng: z.number().min(35).max(36.8) });

/**
 * Where an Available rider's phone is, sent every few minutes while the app
 * is open (RiderLocation), so orders go to whoever is near the pickup now.
 * Kept rounded, only while Available, and readable by the server alone.
 * Outside Lebanon (the box above) it's ignored.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, reason: "outside" });

  const db = createAdminClient();
  const { provider } = await myErrandProfiles(db, user.id);
  if (!provider?.available_now) return NextResponse.json({ ok: false, reason: "offline" });
  const { error } = await db
    .from("rider_locations")
    .upsert({ profile_id: provider.id, lat: round(parsed.data.lat), lng: round(parsed.data.lng), located_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

/** Stops using the rider's position (they turned it off, or went Offline). */
export async function DELETE() {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const db = createAdminClient();
  const { provider } = await myErrandProfiles(db, user.id);
  if (provider) await db.from("rider_locations").delete().eq("profile_id", provider.id);
  return NextResponse.json({ ok: true });
}
