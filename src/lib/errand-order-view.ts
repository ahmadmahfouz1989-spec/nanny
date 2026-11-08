import { createAdminClient } from "@/lib/supabase/admin";
import { ratingAggregatesByUser, type RatingAggregate } from "@/lib/ratings";
import { distanceKm, type OrderStatus } from "@/lib/errand-orders";
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
export type OrderPlace = {
  district: PlaceName | null;
  area: PlaceName | null;
  detail: string | null;
  /** On the map: the exact point, or (approximate) the area's centre. */
  point: { lat: number; lng: number } | null;
  /** Only the area is shown (a rider who hasn't confirmed sees the drop-off this way). */
  approximate: boolean;
  address: string | null;
  /** The shop, business or place's name. */
  name: string | null;
  instructions: string | null;
  /** Who to ask for there: the confirmed rider, the customer and admins only. */
  contactName: string | null;
  contactPhone: string | null;
};

/** Pickup to drop-off: straight-line km and a Google Maps directions link. */
export type OrderRoute = { km: number | null; approximate: boolean; mapsUrl: string | null };

export type OrderPerson = { profileId: string; name: string; photoUrl: string | null; rating: RatingAggregate };

export type OrderOffer = OrderPerson & {
  recipientId: string;
  distanceKm: number | null;
  priceUsd: number | null;
  /** A repair quote can be a range: priceUsd–priceMaxUsd. */
  priceMaxUsd: number | null;
  etaMinutes: number | null;
  /** A repair quote: when they can come. */
  visitAt: string | null;
  note: string | null;
  status: RecipientRow["status"];
  respondedAt: string | null;
  rank: number;
  /** Which wave of the search reached them (1 = the first). */
  wave: number;
};

/** Someone the order was sent to, and what they did with it. */
export type OrderAsked = OrderPerson & { status: RecipientRow["status"]; distanceKm: number | null; wave: number };

/**
 * Where a delivery is in its matching. The deadlines are what the
 * countdowns show; `serverNow` lets the screen count from the server's
 * clock rather than the phone's.
 */
export type OrderMatching = {
  wave: number;
  radiusKm: number | null;
  /** The current wave's providers answer by then. */
  waveUntil: string | null;
  /** The customer chooses an offer by then. */
  chooseUntil: string | null;
  /** The chosen provider confirms by then. */
  confirmUntil: string | null;
};

export type OrderView = {
  viewer: Viewer;
  id: string;
  number: number;
  /** "errands" (a delivery or errand) or "maintenance" (a repair job asking for quotes). */
  category: string;
  service: string;
  description: string;
  /** Short-lived links to the job's photos. */
  photoUrls: string[];
  pickup: OrderPlace;
  dropoff: OrderPlace | null;
  route: OrderRoute;
  timing: string;
  scheduledAt: string | null;
  budgetUsd: number | null;
  status: OrderStatus;
  /** How many providers were ever asked: none means nobody heard about it. */
  sentTo: number;
  statusChangedAt: string;
  createdAt: string;
  openUntil: string;
  cancelledBy: string | null;
  cancelReason: string | null;
  /** The conversation, once confirmed. */
  matchId: string | null;
  /** Customer and admin, during a delivery: where the rider was a moment ago. */
  riderAt: { lat: number; lng: number; at: string; accuracyM: number | null } | null;
  /** Provider view: this order was given to the viewer. */
  assignedToMe: boolean;
  customer: OrderPerson | null;
  provider: OrderPerson | null;
  /** Seeker: the offers made. Admin: every provider it was sent to. Provider: empty. */
  offers: OrderOffer[];
  /** Seeker and admin: everyone it was sent to, nearest first. Provider: empty. */
  asked: OrderAsked[];
  counts: { sent: number; offered: number; declined: number; waiting: number; noResponse: number };
  /** Timers for a delivery; null for a repair request (no timers). */
  matching: OrderMatching | null;
  serverNow: string;
  /** Provider only: their own answer. */
  mine: {
    recipientId: string;
    status: RecipientRow["status"];
    priceUsd: number | null;
    priceMaxUsd: number | null;
    etaMinutes: number | null;
    visitAt: string | null;
    note: string | null;
    distanceKm: number | null;
    /** While their answer is awaited: when their time to answer runs out. */
    respondBy: string | null;
  } | null;
  /** When each stage was reached, for the timeline. */
  timeline: { status: string; at: string }[];
  /** Admin only: the full history. */
  events: { type: string; actorRole: string; detail: unknown; at: string }[] | null;
};

async function placeNames(db: Admin, ids: (string | null)[]): Promise<Map<string, PlaceName & { lat: number | null; lng: number | null }>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const out = new Map<string, PlaceName & { lat: number | null; lng: number | null }>();
  if (unique.length === 0) return out;
  const { data } = await db.from("locations").select("id, name_en, name_ar, lat, lon").in("id", unique);
  for (const row of data ?? []) out.set(row.id, { en: row.name_en, ar: row.name_ar, lat: row.lat, lng: row.lon });
  return out;
}

const mapsPoint = (p: { lat: number; lng: number }) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Google Maps: directions from pickup to drop-off, or the pickup alone. Opens the Maps app on phones. */
function mapsLink(from: { lat: number; lng: number } | null, to: { lat: number; lng: number } | null): string | null {
  if (from && to) return `https://www.google.com/maps/dir/?api=1&origin=${mapsPoint(from)}&destination=${mapsPoint(to)}&travelmode=driving`;
  const one = from ?? to;
  return one ? `https://www.google.com/maps/search/?api=1&query=${mapsPoint(one)}` : null;
}

export async function orderPeople(db: Admin, profileIds: (string | null)[]): Promise<Map<string, OrderPerson & { userId: string }>> {
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

/** Signed links (an hour) to an order's photos; only called for people allowed to see the order. */
async function photoLinks(db: Admin, paths: string[]): Promise<string[]> {
  if (!paths?.length) return [];
  const { data } = await db.storage.from("order-photos").createSignedUrls(paths, 3600);
  return (data ?? []).map((d) => d.signedUrl).filter((u): u is string => !!u);
}

/** A rider position older than this isn't shown: they've closed the app. */
const TRACKING_FRESH_MS = 5 * 60_000;

export async function orderView(db: Admin, order: OrderRow, viewer: Viewer, viewerUserId: string): Promise<OrderView> {
  // The rider on the map: only for the customer (and admins), only mid-delivery.
  const tracked = order.category === "errands" && ["accepted", "on_the_way", "arrived", "picked_up"].includes(order.status) && (viewer === "admin" || order.seeker_user_id === viewerUserId);
  const { data: track } = tracked ? await db.from("errand_order_tracking").select("lat, lng, accuracy_m, located_at").eq("order_id", order.id).maybeSingle() : { data: null };
  const riderAt =
    track && Date.now() - Date.parse(track.located_at) < TRACKING_FRESH_MS
      ? { lat: track.lat, lng: track.lng, at: track.located_at, accuracyM: track.accuracy_m }
      : null;
  const [{ data: recipients }, { data: events }, names] = await Promise.all([
    db.from("errand_order_recipients").select("*").eq("order_id", order.id).order("rank"),
    db.from("errand_order_events").select("type, actor_role, detail, created_at").eq("order_id", order.id).order("id"),
    placeNames(db, [order.pickup_district_id, order.pickup_area_id, order.dropoff_district_id, order.dropoff_area_id]),
  ]);
  const all = recipients ?? [];
  const persons = await orderPeople(db, [order.seeker_profile_id, order.provider_profile_id, ...all.map((r) => r.provider_profile_id)]);

  // Who sees the exact places. The customer and admins: everything. A
  // rider asked to quote: the exact pickup (it's usually a shop), but only
  // the drop-off's area -- it's often someone's home -- and no contact
  // details. The rider who confirms: everything.
  const confirmedRider =
    viewer === "provider" && order.provider_user_id === viewerUserId && !["open", "reserved"].includes(order.status);
  const full = viewer !== "provider" || confirmedRider;
  const nameOnly = (id: string | null) => {
    const n = id ? names.get(id) : undefined;
    return n ? { en: n.en, ar: n.ar } : null;
  };
  const centre = (area: string | null, district: string | null) => {
    const n = (area && names.get(area)) || (district && names.get(district)) || null;
    return n && n.lat !== null && n.lng !== null ? { lat: n.lat, lng: n.lng } : null;
  };
  type Side = "pickup" | "dropoff";
  const place = (side: Side, exact: boolean): OrderPlace => {
    const district = side === "pickup" ? order.pickup_district_id : order.dropoff_district_id;
    const area = side === "pickup" ? order.pickup_area_id : order.dropoff_area_id;
    const lat = side === "pickup" ? order.pickup_lat : order.dropoff_lat;
    const lng = side === "pickup" ? order.pickup_lng : order.dropoff_lng;
    const own = lat !== null && lng !== null ? { lat, lng } : null;
    const base = { district: nameOnly(district), area: nameOnly(area) };
    if (!exact) {
      // The old landmark field ("area or landmark only") was always shown to riders.
      const detail = side === "pickup" ? order.pickup_detail : order.dropoff_detail;
      return { ...base, detail, point: centre(area, district), approximate: true, address: null, name: null, instructions: null, contactName: null, contactPhone: null };
    }
    const contact = full;
    return {
      ...base,
      detail: side === "pickup" ? order.pickup_detail : order.dropoff_detail,
      point: own ?? centre(area, district),
      approximate: !own,
      address: side === "pickup" ? order.pickup_address : order.dropoff_address,
      name: side === "pickup" ? order.pickup_place_name : order.dropoff_place_name,
      instructions: side === "pickup" ? order.pickup_instructions : order.dropoff_instructions,
      contactName: contact ? (side === "pickup" ? order.pickup_contact_name : order.dropoff_contact_name) : null,
      contactPhone: contact ? (side === "pickup" ? order.pickup_contact_phone : order.dropoff_contact_phone) : null,
    };
  };
  const pickupPlace = place("pickup", true);
  const dropoffPlace = order.dropoff_district_id ? place("dropoff", full) : null;
  const routeKm = pickupPlace.point && dropoffPlace?.point ? distanceKm({ lat: pickupPlace.point.lat, lon: pickupPlace.point.lng }, { lat: dropoffPlace.point.lat, lon: dropoffPlace.point.lng }) : null;
  const route: OrderRoute = {
    km: routeKm,
    approximate: pickupPlace.approximate || !!dropoffPlace?.approximate,
    mapsUrl: mapsLink(pickupPlace.point, dropoffPlace?.point ?? null),
  };

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
      priceMaxUsd: r.price_max_usd,
      etaMinutes: r.eta_minutes,
      visitAt: r.visit_at,
      note: r.note,
      status: r.status,
      respondedAt: r.responded_at,
      rank: r.rank,
      wave: r.wave,
    };
  });

  const delivery = order.category !== "maintenance";
  const mineRow = viewer === "provider" ? all.find((r) => r.provider_user_id === viewerUserId) : undefined;
  const timeline = (events ?? [])
    .filter((e) => e.type === "status" || e.type === "created")
    .map((e) => ({ status: e.type === "created" ? "open" : String((e.detail as { status?: unknown })?.status ?? ""), at: e.created_at }));

  return {
    viewer,
    id: order.id,
    number: order.number,
    category: order.category,
    service: order.service,
    description: order.description,
    photoUrls: await photoLinks(db, order.photo_paths),
    pickup: pickupPlace,
    dropoff: dropoffPlace,
    route,
    timing: order.timing,
    scheduledAt: order.scheduled_at,
    budgetUsd: order.budget_usd,
    status: order.status as OrderStatus,
    sentTo: all.length,
    statusChangedAt: order.status_changed_at,
    createdAt: order.created_at,
    openUntil: order.open_until,
    cancelledBy: order.cancelled_by,
    cancelReason: order.cancel_reason,
    // The chat is only for the two people on the order.
    matchId: viewer === "admin" || order.provider_user_id === viewerUserId || order.seeker_user_id === viewerUserId ? order.generic_match_id : null,
    riderAt,
    assignedToMe: order.provider_user_id === viewerUserId,
    // Providers sent the order see what's asked and where, not who: the
    // customer's name and photo go only to the one doing it. Nor does a
    // provider learn who else was chosen.
    customer: viewer === "provider" && order.provider_user_id !== viewerUserId ? null : strip(persons.get(order.seeker_profile_id ?? "")),
    provider: viewer === "provider" && order.provider_user_id !== viewerUserId ? null : strip(persons.get(order.provider_profile_id ?? "")),
    offers,
    asked:
      viewer === "provider"
        ? []
        : all.map((r) => {
            const person = persons.get(r.provider_profile_id);
            return {
              profileId: r.provider_profile_id,
              name: person?.name ?? "",
              photoUrl: person?.photoUrl ?? null,
              rating: person?.rating ?? { average: null, count: 0 },
              status: r.status,
              distanceKm: r.distance_km !== null ? Number(r.distance_km) : null,
              wave: r.wave,
            };
          }),
    counts: {
      sent: all.length,
      offered: all.filter((r) => r.status === "offered" || r.status === "selected").length,
      declined: all.filter((r) => r.status === "declined" || r.status === "withdrawn").length,
      waiting: all.filter((r) => r.status === "sent").length,
      noResponse: all.filter((r) => r.status === "expired").length,
    },
    matching: delivery
      ? {
          wave: order.wave,
          radiusKm: order.radius_km !== null ? Number(order.radius_km) : null,
          waveUntil: order.wave_until,
          chooseUntil: order.choose_until,
          // A provider only learns their own confirmation deadline.
          confirmUntil: viewer !== "provider" || order.provider_user_id === viewerUserId ? order.confirm_until : null,
        }
      : null,
    serverNow: new Date().toISOString(),
    mine: mineRow
      ? {
          recipientId: mineRow.id,
          status: mineRow.status,
          priceUsd: mineRow.price_usd,
          priceMaxUsd: mineRow.price_max_usd,
          etaMinutes: mineRow.eta_minutes,
          visitAt: mineRow.visit_at,
          note: mineRow.note,
          distanceKm: mineRow.distance_km,
          respondBy: delivery && order.status === "open" && mineRow.status === "sent" && !order.choose_until ? order.wave_until : null,
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
      category: o.category,
      service: o.service,
      description: o.description,
      photos: o.photo_paths?.length ?? 0,
      pickupDistrict: nameOf(o.pickup_area_id, o.pickup_district_id),
      dropoffDistrict: o.dropoff_district_id ? nameOf(o.dropoff_area_id, o.dropoff_district_id) : null,
      status: o.status,
      createdAt: o.created_at,
      timing: o.timing,
      scheduledAt: o.scheduled_at,
      offers: mine.filter((r) => r.status === "offered" || r.status === "selected").length,
      sent: mine.length,
      /** Offers are in and the customer is picking one. */
      choosing: o.status === "open" && !!o.choose_until,
      /** The current wave's answers are due then (deliveries only). */
      waveUntil: o.category === "maintenance" ? null : o.wave_until,
    };
  });
}

export type OrderSummary = Awaited<ReturnType<typeof orderSummaries>>[number];
