import { createAdminClient } from "@/lib/supabase/admin";
import { ratingAggregatesByUser, type RatingAggregate } from "@/lib/ratings";
import type { OrderStatus } from "@/lib/errand-orders";
import type { Tables } from "@/lib/supabase/database.types";

// What each side sees of an order. The customer sees the offers (price,
// time, the provider's name, photo, rating and distance) but not who
// declined; a provider sees the order and their own answer only, never
// the other offers; an admin sees everything, history included.

type Admin = ReturnType<typeof createAdminClient>;
type OrderRow = Tables<"errand_orders">;
type RecipientRow = Tables<"errand_order_recipients">;

export type Viewer = "seeker" | "provider" | "admin";

type PlaceName = { en: string; ar: string };
export type OrderPlace = { district: PlaceName | null; area: PlaceName | null; detail: string | null };

export type OrderPerson = { profileId: string; name: string; photoUrl: string | null; rating: RatingAggregate };

export type OrderOffer = OrderPerson & {
  recipientId: string;
  distanceKm: number | null;
  priceUsd: number | null;
  etaMinutes: number | null;
  note: string | null;
  status: RecipientRow["status"];
  respondedAt: string | null;
  rank: number;
};

export type OrderView = {
  viewer: Viewer;
  id: string;
  number: number;
  service: string;
  description: string;
  pickup: OrderPlace;
  dropoff: OrderPlace | null;
  timing: string;
  scheduledAt: string | null;
  budgetUsd: number | null;
  status: OrderStatus;
  statusChangedAt: string;
  createdAt: string;
  openUntil: string;
  cancelledBy: string | null;
  cancelReason: string | null;
  /** The conversation, once confirmed. */
  matchId: string | null;
  /** Provider view: this order was given to the viewer. */
  assignedToMe: boolean;
  customer: OrderPerson | null;
  provider: OrderPerson | null;
  /** Seeker: the offers made. Admin: every provider it was sent to. Provider: empty. */
  offers: OrderOffer[];
  counts: { sent: number; offered: number; declined: number; waiting: number };
  /** Provider only: their own answer. */
  mine: { recipientId: string; status: RecipientRow["status"]; priceUsd: number | null; etaMinutes: number | null; note: string | null; distanceKm: number | null } | null;
  /** When each stage was reached, for the timeline. */
  timeline: { status: string; at: string }[];
  /** Admin only: the full history. */
  events: { type: string; actorRole: string; detail: unknown; at: string }[] | null;
};

async function placeNames(db: Admin, ids: (string | null)[]): Promise<Map<string, PlaceName>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const out = new Map<string, PlaceName>();
  if (unique.length === 0) return out;
  const { data } = await db.from("locations").select("id, name_en, name_ar").in("id", unique);
  for (const row of data ?? []) out.set(row.id, { en: row.name_en, ar: row.name_ar });
  return out;
}

async function people(db: Admin, profileIds: (string | null)[]): Promise<Map<string, OrderPerson & { userId: string }>> {
  const unique = [...new Set(profileIds.filter((id): id is string => !!id))];
  const out = new Map<string, OrderPerson & { userId: string }>();
  if (unique.length === 0) return out;
  const { data } = await db.from("generic_profiles").select("id, user_id, full_name, profile_photo_url").in("id", unique);
  const ratings = await ratingAggregatesByUser((data ?? []).map((p) => p.user_id));
  for (const p of data ?? []) {
    out.set(p.id, {
      profileId: p.id,
      userId: p.user_id,
      name: p.full_name,
      photoUrl: p.profile_photo_url,
      rating: ratings.get(p.user_id) ?? { average: null, count: 0 },
    });
  }
  return out;
}

const strip = <T extends { userId: string }>(p: T | undefined): Omit<T, "userId"> | null => {
  if (!p) return null;
  const rest: Omit<T, "userId"> & { userId?: string } = { ...p };
  delete rest.userId;
  return rest;
};

export async function orderView(db: Admin, order: OrderRow, viewer: Viewer, viewerUserId: string): Promise<OrderView> {
  const [{ data: recipients }, { data: events }, names] = await Promise.all([
    db.from("errand_order_recipients").select("*").eq("order_id", order.id).order("rank"),
    db.from("errand_order_events").select("type, actor_role, detail, created_at").eq("order_id", order.id).order("id"),
    placeNames(db, [order.pickup_district_id, order.pickup_area_id, order.dropoff_district_id, order.dropoff_area_id]),
  ]);
  const all = recipients ?? [];
  const persons = await people(db, [order.seeker_profile_id, order.provider_profile_id, ...all.map((r) => r.provider_profile_id)]);

  const place = (district: string | null, area: string | null, detail: string | null): OrderPlace => ({
    district: district ? (names.get(district) ?? null) : null,
    area: area ? (names.get(area) ?? null) : null,
    detail,
  });

  const shown =
    viewer === "admin" ? all : viewer === "seeker" ? all.filter((r) => ["offered", "selected", "refused"].includes(r.status) && r.price_usd !== null) : [];
  const offers: OrderOffer[] = shown.map((r) => {
    const person = persons.get(r.provider_profile_id);
    return {
      recipientId: r.id,
      profileId: r.provider_profile_id,
      name: person?.name ?? "",
      photoUrl: person?.photoUrl ?? null,
      rating: person?.rating ?? { average: null, count: 0 },
      distanceKm: r.distance_km,
      priceUsd: r.price_usd,
      etaMinutes: r.eta_minutes,
      note: r.note,
      status: r.status,
      respondedAt: r.responded_at,
      rank: r.rank,
    };
  });

  const mineRow = viewer === "provider" ? all.find((r) => r.provider_user_id === viewerUserId) : undefined;
  const timeline = (events ?? [])
    .filter((e) => e.type === "status" || e.type === "created")
    .map((e) => ({ status: e.type === "created" ? "open" : String((e.detail as { status?: unknown })?.status ?? ""), at: e.created_at }));

  return {
    viewer,
    id: order.id,
    number: order.number,
    service: order.service,
    description: order.description,
    pickup: place(order.pickup_district_id, order.pickup_area_id, order.pickup_detail),
    dropoff: order.dropoff_district_id ? place(order.dropoff_district_id, order.dropoff_area_id, order.dropoff_detail) : null,
    timing: order.timing,
    scheduledAt: order.scheduled_at,
    budgetUsd: order.budget_usd,
    status: order.status as OrderStatus,
    statusChangedAt: order.status_changed_at,
    createdAt: order.created_at,
    openUntil: order.open_until,
    cancelledBy: order.cancelled_by,
    cancelReason: order.cancel_reason,
    // The chat is only for the two people on the order.
    matchId: viewer === "admin" || order.provider_user_id === viewerUserId || order.seeker_user_id === viewerUserId ? order.generic_match_id : null,
    assignedToMe: order.provider_user_id === viewerUserId,
    // Providers sent the order see what's asked and where, not who: the
    // customer's name and photo go only to the one doing it. Nor does a
    // provider learn who else was chosen.
    customer: viewer === "provider" && order.provider_user_id !== viewerUserId ? null : strip(persons.get(order.seeker_profile_id ?? "")),
    provider: viewer === "provider" && order.provider_user_id !== viewerUserId ? null : strip(persons.get(order.provider_profile_id ?? "")),
    offers,
    counts: {
      sent: all.length,
      offered: all.filter((r) => r.status === "offered" || r.status === "selected").length,
      declined: all.filter((r) => r.status === "declined" || r.status === "withdrawn").length,
      waiting: all.filter((r) => r.status === "sent").length,
    },
    mine: mineRow
      ? {
          recipientId: mineRow.id,
          status: mineRow.status,
          priceUsd: mineRow.price_usd,
          etaMinutes: mineRow.eta_minutes,
          note: mineRow.note,
          distanceKm: mineRow.distance_km,
        }
      : null,
    timeline,
    events:
      viewer === "admin"
        ? (events ?? []).map((e) => ({ type: e.type, actorRole: e.actor_role, detail: e.detail, at: e.created_at }))
        : null,
  };
}

/** Short summaries for a list of orders (no offers or history). */
export async function orderSummaries(db: Admin, orders: OrderRow[]) {
  // Lists name the area when there is one ("Ras Beirut → Achrafieh"), not
  // just the district ("Beirut → Beirut").
  const names = await placeNames(
    db,
    orders.flatMap((o) => [o.pickup_district_id, o.dropoff_district_id, o.pickup_area_id, o.dropoff_area_id]),
  );
  const nameOf = (area: string | null, district: string | null) =>
    (area ? names.get(area) : undefined) ?? (district ? names.get(district) : undefined) ?? null;
  const ids = orders.map((o) => o.id);
  const { data: recipients } = ids.length
    ? await db.from("errand_order_recipients").select("order_id, status").in("order_id", ids)
    : { data: [] as { order_id: string; status: string }[] };
  return orders.map((o) => {
    const mine = (recipients ?? []).filter((r) => r.order_id === o.id);
    return {
      id: o.id,
      number: o.number,
      service: o.service,
      description: o.description,
      pickupDistrict: nameOf(o.pickup_area_id, o.pickup_district_id),
      dropoffDistrict: o.dropoff_district_id ? nameOf(o.dropoff_area_id, o.dropoff_district_id) : null,
      status: o.status,
      createdAt: o.created_at,
      timing: o.timing,
      scheduledAt: o.scheduled_at,
      offers: mine.filter((r) => r.status === "offered" || r.status === "selected").length,
      sent: mine.length,
    };
  });
}

export type OrderSummary = Awaited<ReturnType<typeof orderSummaries>>[number];
