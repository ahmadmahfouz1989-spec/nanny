import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveUser } from "@/lib/session";
import { containsContactInfo } from "@/lib/content-filter";
import { orderCreateSchema } from "@/lib/validation/errand-order";
import { closeExpiredOrders, dispatchOrder, errandSettings, logOrderEvent, myErrandProfiles } from "@/lib/errand-orders";
import { orderSummaries } from "@/lib/errand-order-view";

const CONTACT_ERROR = "Please remove phone numbers, emails, or social handles. You can share them in chat once a provider confirms.";

/**
 * The caller's orders. `?as=seeker` (default): orders they placed.
 * `?as=provider`: orders sent to them that are still open for offers, plus
 * the ones they're doing or did.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const db = createAdminClient();
  const as = new URL(request.url).searchParams.get("as") === "provider" ? "provider" : "seeker";
  const profiles = await myErrandProfiles(db, user.id);

  if (as === "seeker") {
    await closeExpiredOrders(db, { seekerUserId: user.id });
    const { data } = await db
      .from("errand_orders")
      .select("*")
      .eq("seeker_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    return NextResponse.json({ canOrder: !!profiles.seeker, orders: await orderSummaries(db, data ?? []) });
  }

  if (!profiles.provider) return NextResponse.json({ provider: null, incoming: [], assigned: [] });

  const { data: received } = await db
    .from("errand_order_recipients")
    .select("order_id, status, price_usd, eta_minutes, distance_km")
    .eq("provider_user_id", user.id)
    .in("status", ["sent", "offered"])
    .order("sent_at", { ascending: false })
    .limit(50);
  const receivedIds = (received ?? []).map((r) => r.order_id);
  // Orders past their time drop out of the list (closed as "no provider").
  for (const orderId of receivedIds) await closeExpiredOrders(db, { orderId });
  const [{ data: open }, { data: assigned }] = await Promise.all([
    receivedIds.length
      ? db.from("errand_orders").select("*").in("id", receivedIds).eq("status", "open")
      : Promise.resolve({ data: [] as never[] }),
    db.from("errand_orders").select("*").eq("provider_user_id", user.id).order("created_at", { ascending: false }).limit(50),
  ]);

  const incoming = (await orderSummaries(db, open ?? [])).map((o) => {
    const r = (received ?? []).find((x) => x.order_id === o.id);
    return { ...o, myStatus: r?.status ?? "sent", myPriceUsd: r?.price_usd ?? null, distanceKm: r?.distance_km ?? null };
  });
  return NextResponse.json({
    provider: { profileId: profiles.provider.id, availableNow: profiles.provider.available_now },
    incoming,
    assigned: await orderSummaries(db, assigned ?? []),
  });
}

/**
 * A customer places an order. It goes straight to the nearest eligible
 * providers (lib/errand-orders.ts); with none, it closes at once as
 * "no provider" so the customer can try again later.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const user = await requireActiveUser(supabase);
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const parsed = orderCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const o = parsed.data;
  if ([o.description, o.pickupDetail, o.dropoffDetail].some((text) => text && containsContactInfo(text))) {
    return NextResponse.json({ error: CONTACT_ERROR }, { status: 400 });
  }

  const db = createAdminClient();
  const { seeker } = await myErrandProfiles(db, user.id);
  if (!seeker) {
    return NextResponse.json({ error: "Create your Delivery & Errands request profile before you order.", code: "profile_required" }, { status: 403 });
  }

  // The places must be real districts (and areas inside them).
  const ids = [o.pickupDistrictId, o.pickupAreaId, o.dropoffDistrictId, o.dropoffAreaId].filter((id): id is string => !!id);
  const { data: places } = await db.from("locations").select("id, level, parent_location_id").in("id", ids);
  const byId = new Map((places ?? []).map((p) => [p.id, p]));
  const district = (id: string | null | undefined) => !id || byId.get(id)?.level === "district";
  const areaIn = (area: string | null | undefined, parent: string | null | undefined) =>
    !area || (byId.get(area)?.level === "area" && byId.get(area)?.parent_location_id === parent);
  if (!district(o.pickupDistrictId) || !district(o.dropoffDistrictId) || !areaIn(o.pickupAreaId, o.pickupDistrictId) || !areaIn(o.dropoffAreaId, o.dropoffDistrictId)) {
    return NextResponse.json({ error: "Choose the places from the list" }, { status: 400 });
  }

  // Some protection against an account flooding providers.
  const { count } = await db
    .from("errand_orders")
    .select("id", { count: "exact", head: true })
    .eq("seeker_user_id", user.id)
    .in("status", ["open", "reserved"]);
  if ((count ?? 0) >= 3) {
    return NextResponse.json({ error: "You already have 3 orders waiting. Choose an offer or cancel one first." }, { status: 429 });
  }

  const settings = await errandSettings(db);
  const { data: order, error } = await db
    .from("errand_orders")
    .insert({
      seeker_user_id: user.id,
      seeker_profile_id: seeker.id,
      service: o.service,
      description: o.description,
      pickup_district_id: o.pickupDistrictId,
      pickup_area_id: o.pickupAreaId ?? null,
      pickup_detail: o.pickupDetail || null,
      dropoff_district_id: o.dropoffDistrictId ?? null,
      dropoff_area_id: o.dropoffAreaId ?? null,
      dropoff_detail: o.dropoffDetail || null,
      timing: o.timing,
      scheduled_at: o.timing === "scheduled" ? (o.scheduledAt ?? null) : null,
      budget_usd: o.budgetUsd ?? null,
      open_until: new Date(Date.now() + settings.open_minutes * 60_000).toISOString(),
    })
    .select("*")
    .single();
  if (error || !order) return NextResponse.json({ error: error?.message ?? "Could not place the order" }, { status: 400 });

  await logOrderEvent(db, order.id, { userId: user.id, role: "seeker" }, "created");
  const sent = await dispatchOrder(db, { ...order, service: o.service }, { userId: user.id, role: "seeker" });
  if (sent === 0) {
    await db.from("errand_orders").update({ status: "no_provider", status_changed_at: new Date().toISOString(), cancelled_by: "system" }).eq("id", order.id);
    // No notification: the customer is looking at the answer on screen.
    await logOrderEvent(db, order.id, { userId: null, role: "system" }, "status", { status: "no_provider" });
  }

  return NextResponse.json({ order: { id: order.id, number: order.number, status: sent === 0 ? "no_provider" : "open", sent } }, { status: 201 });
}
