import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { activeOrderCounts, errandSettings, myErrandProfiles } from "@/lib/errand-orders";

/**
 * A Delivery & Errands provider's status: available (green), busy
 * (orange, as many orders in progress as errand_settings.max_active_orders
 * allows -- worked out, not switched), offline
 * (grey) or suspended (red, by an admin). Only available / offline is
 * theirs to switch.
 */
async function state(db: ReturnType<typeof createAdminClient>, userId: string) {
  const { provider } = await myErrandProfiles(db, userId);
  if (!provider) return null;
  const [load, settings, { data: user }, { data: profile }] = await Promise.all([
    activeOrderCounts(db, [provider.id]),
    errandSettings(db),
    db.from("users").select("status").eq("id", userId).single(),
    db.from("generic_profiles").select("attributes").eq("id", provider.id).single(),
  ]);
  const busy = (load.get(provider.id) ?? 0) >= settings.max_active_orders;
  const status = user?.status === "suspended" ? "suspended" : busy ? "busy" : provider.available_now ? "available" : "offline";
  // Requests go only to riders with a district (see findProviders): one saved
  // before districts were asked for gets none until they add it.
  const needsArea = typeof (profile?.attributes as { districtId?: unknown } | null)?.districtId !== "string";
  return { profileId: provider.id, availableNow: provider.available_now, status, needsArea };
}

export async function GET() {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  return NextResponse.json({ availability: await state(createAdminClient(), user.id) });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const parsed = z.object({ available: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "available must be true or false" }, { status: 400 });

  const db = createAdminClient();
  const { provider } = await myErrandProfiles(db, user.id);
  if (!provider) return NextResponse.json({ error: "Your Delivery & Errands provider profile needs to be approved first" }, { status: 403 });
  await db
    .from("generic_profiles")
    .update({ available_now: parsed.data.available, available_changed_at: new Date().toISOString() })
    .eq("id", provider.id);
  return NextResponse.json({ availability: await state(db, user.id) });
}
