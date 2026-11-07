import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { advanceOrders, DEFAULT_SETTINGS, dispatchOrder, eligibleProviders, myErrandProfiles, nextWaveOrClose } from "@/lib/errand-orders";
import { orderView } from "@/lib/errand-order-view";
import { placeOfPoint } from "@/lib/nearest-place";
import { rememberRecentPlaces, savedPlaces } from "@/lib/saved-places";
import { adminAction, providerAction, seekerAction } from "@/lib/errand-order-actions";
import { ensureErrandRequestProfile, ensureJobRequestProfile } from "@/lib/job-request-profile";
import { admin, cleanupUsers, createProfile, createUser, type TestUser } from "./helpers";

// Delivery & Errands orders: who receives an order and in what order,
// waves and timers, offers, choosing, confirming, the stages, dropping
// out, and that no client can read the tables directly.

/** Sets the matching settings for a block of tests (back to the defaults afterwards). */
async function useSettings(values: Partial<typeof DEFAULT_SETTINGS>) {
  await admin.from("errand_settings").update({ ...DEFAULT_SETTINGS, ...values }).eq("id", true);
}

afterAll(async () => {
  await useSettings({});
  await cleanupUsers();
});

async function district(code: string) {
  const { data } = await admin.from("locations").select("id, parent_location_id").eq("code", code).single();
  return data!;
}

let beirut: { id: string; parent_location_id: string | null };
let baabda: { id: string; parent_location_id: string | null };
let tripoli: { id: string; parent_location_id: string | null };

async function provider(tag: string, home: typeof beirut, opts: { services?: string[]; cover?: string[]; available?: boolean } = {}) {
  const user = await createUser(tag);
  const id = await createProfile(user, "errands", "provider", {
    errandServices: opts.services ?? ["delivery"],
    districtId: home.id,
    coverDistrictIds: opts.cover ?? [],
  });
  await admin.from("generic_profiles").update({ location_id: home.parent_location_id, available_now: opts.available ?? true }).eq("id", id);
  return { user, profileId: id };
}

async function placeOrder(seeker: TestUser, seekerProfileId: string, pickup: typeof beirut, service = "delivery") {
  const { data } = await admin
    .from("errand_orders")
    .insert({
      seeker_user_id: seeker.id,
      seeker_profile_id: seekerProfileId,
      service,
      description: "A small parcel",
      pickup_district_id: pickup.id,
      dropoff_district_id: pickup.id,
      timing: "asap",
      open_until: new Date(Date.now() + 3600_000).toISOString(),
    })
    .select("*")
    .single();
  return data!;
}

const fresh = async (id: string) => (await admin.from("errand_orders").select("*").eq("id", id).single()).data!;

describe("errand orders", () => {
  let customer: TestUser;
  let customerProfile: string;
  let near: Awaited<ReturnType<typeof provider>>;
  let covering: Awaited<ReturnType<typeof provider>>;

  beforeAll(async () => {
    // One wave reaching everyone, as far as needed: these tests are about
    // offers and stages, not waves.
    await useSettings({ wave_size: 50, initial_radius_km: 300, max_radius_km: 300 });
    [beirut, baabda, tripoli] = await Promise.all([district("LB11"), district("LB32"), district("LB56")]);
    customer = await createUser("order-customer");
    customerProfile = await createProfile(customer, "errands", "seeker", { errandService: "delivery", districtId: beirut.id });
    near = await provider("order-near", beirut);
    // Lives in Baabda but covers Beirut: eligible, further away.
    covering = await provider("order-covering", baabda, { cover: [beirut.id] });
    // Not eligible: offline, wrong service, elsewhere.
    await provider("order-offline", beirut, { available: false });
    await provider("order-paperwork", beirut, { services: ["paperwork"] });
    await provider("order-tripoli", tripoli);
  });

  it("lets a customer order while their request is in review, but a rider only once approved", async () => {
    const newcomer = await createUser("order-newcomer");
    const request = await createProfile(newcomer, "errands", "seeker", { errandService: "delivery", districtId: beirut.id }, { approved: false });
    const rider = await createProfile(newcomer, "errands", "provider", { errandServices: ["delivery"], districtId: beirut.id }, { approved: false });
    const mine = await myErrandProfiles(admin, newcomer.id);
    expect(mine.seeker?.id).toBe(request);
    expect(mine.provider).toBeNull();

    await admin.from("generic_profiles").update({ moderation_status: "rejected" }).eq("id", request);
    expect((await myErrandProfiles(admin, newcomer.id)).seeker).toBeNull();
    expect(rider).toBeTruthy();
  });

  it("sends an order only to eligible providers, nearest first", async () => {
    const found = await eligibleProviders(
      admin,
      { service: "delivery", pickupDistrictId: beirut.id, pickupAreaId: null, seekerUserId: customer.id },
      { limit: 50 },
    );
    const ids = found.map((f) => f.profileId);
    const mine = ids.filter((id) => id === near.profileId || id === covering.profileId);
    expect(mine).toEqual([near.profileId, covering.profileId]);
    expect(found.find((f) => f.profileId === near.profileId)!.distanceKm).toBe(0);
    expect(found.find((f) => f.profileId === covering.profileId)!.distanceKm).toBeGreaterThan(0);
  });

  it("runs an order from offer to completed", async () => {
    const order = await placeOrder(customer, customerProfile, beirut);
    expect(await dispatchOrder(admin, order, { userId: customer.id, role: "seeker" })).toBeGreaterThanOrEqual(2);

    const asNear = { userId: near.user.id, role: "provider" as const };
    const asCustomer = { userId: customer.id, role: "seeker" as const };
    expect((await providerAction(admin, await fresh(order.id), asNear, "offer", { priceUsd: 5, etaMinutes: 30 })).ok).toBe(true);
    expect((await providerAction(admin, await fresh(order.id), { userId: covering.user.id, role: "provider" }, "decline", {})).ok).toBe(true);

    // The customer sees the offer, not the decline; the provider sees only their own answer.
    const seen = await orderView(admin, await fresh(order.id), "seeker", customer.id);
    expect(seen.offers.map((o) => o.profileId)).toEqual([near.profileId]);
    const theirs = await orderView(admin, await fresh(order.id), "provider", near.user.id);
    expect(theirs.offers).toEqual([]);
    expect(theirs.mine?.priceUsd).toBe(5);

    const recipientId = seen.offers[0]!.recipientId;
    expect((await seekerAction(admin, await fresh(order.id), asCustomer, "select", { recipientId })).ok).toBe(true);
    expect((await fresh(order.id)).status).toBe("reserved");
    expect((await providerAction(admin, await fresh(order.id), asNear, "confirm", {})).ok).toBe(true);
    const confirmed = await fresh(order.id);
    expect(confirmed.status).toBe("accepted");
    expect(confirmed.generic_match_id).not.toBeNull();

    // Busy: a second order doesn't reach them.
    const busyCheck = await eligibleProviders(
      admin,
      { service: "delivery", pickupDistrictId: beirut.id, pickupAreaId: null, seekerUserId: customer.id },
      { limit: 50 },
    );
    expect(busyCheck.map((f) => f.profileId)).not.toContain(near.profileId);

    for (const expected of ["on_the_way", "arrived", "picked_up", "delivered"]) {
      expect((await providerAction(admin, await fresh(order.id), asNear, "advance", {})).ok).toBe(true);
      expect((await fresh(order.id)).status).toBe(expected);
    }
    // Too late to cancel once picked up.
    expect((await seekerAction(admin, await fresh(order.id), asCustomer, "cancel", {})).ok).toBe(false);
    expect((await seekerAction(admin, await fresh(order.id), asCustomer, "complete", {})).ok).toBe(true);
    const done = await orderView(admin, await fresh(order.id), "seeker", customer.id);
    expect(done.status).toBe("completed");
    expect(done.timeline.map((t) => t.status)).toEqual(["reserved", "accepted", "on_the_way", "arrived", "picked_up", "delivered", "completed"]);
  });

  it("goes back out to others when the chosen provider refuses", async () => {
    const order = await placeOrder(customer, customerProfile, beirut);
    await dispatchOrder(admin, order, { userId: customer.id, role: "seeker" });
    const asCovering = { userId: covering.user.id, role: "provider" as const };
    await providerAction(admin, await fresh(order.id), asCovering, "offer", { priceUsd: 8, etaMinutes: 45 });
    const { offers } = await orderView(admin, await fresh(order.id), "seeker", customer.id);
    await seekerAction(admin, await fresh(order.id), { userId: customer.id, role: "seeker" }, "select", { recipientId: offers[0]!.recipientId });
    expect((await providerAction(admin, await fresh(order.id), asCovering, "refuse", {})).ok).toBe(true);
    const after = await fresh(order.id);
    expect(after.provider_profile_id).toBeNull();
    expect(["open", "no_provider"]).toContain(after.status);
  });

  it("closes an order past its time as no provider, and an admin can reopen it", async () => {
    const order = await placeOrder(customer, customerProfile, beirut);
    await admin.from("errand_orders").update({ open_until: new Date(Date.now() - 1000).toISOString() }).eq("id", order.id);
    expect(await advanceOrders(admin, { orderId: order.id })).toBe(1);
    expect((await fresh(order.id)).status).toBe("no_provider");
    const reopened = await adminAction(admin, await fresh(order.id), { userId: customer.id, role: "admin" }, "reopen", {});
    expect(reopened.ok).toBe(true);
  });

  it("finds the district of a map pin, and shows riders the exact drop-off only once they confirm", async () => {
    // A pin in Hamra (Beirut) is in the Beirut district; one at sea is nowhere.
    expect((await placeOfPoint({ lat: 33.8966, lng: 35.4823 }))?.districtId).toBe(beirut.id);
    expect(await placeOfPoint({ lat: 34.2, lng: 34.9 })).toBeNull();

    const order = await placeOrder(customer, customerProfile, beirut);
    await admin
      .from("errand_orders")
      .update({
        pickup_lat: 33.8966,
        pickup_lng: 35.4823,
        pickup_address: "Hamra Street, Beirut",
        pickup_place_name: "Pharmacy Mazen",
        pickup_instructions: "Order under Maya",
        pickup_contact_phone: "+961 1 111 111",
        dropoff_lat: 33.8869,
        dropoff_lng: 35.5203,
        dropoff_address: "Sassine Square, Achrafieh",
        dropoff_instructions: "3rd floor",
        dropoff_contact_name: "Lina",
        dropoff_contact_phone: "+961 3 333 333",
      })
      .eq("id", order.id);
    await dispatchOrder(admin, await fresh(order.id), { userId: customer.id, role: "seeker" });

    // A rider asked to quote: the exact pickup, the drop-off's area only, no phones.
    const asked = await orderView(admin, await fresh(order.id), "provider", near.user.id);
    expect(asked.pickup).toMatchObject({ approximate: false, name: "Pharmacy Mazen", address: "Hamra Street, Beirut", contactPhone: null });
    expect(asked.dropoff).toMatchObject({ approximate: true, address: null, instructions: null, contactName: null, contactPhone: null });
    expect(asked.route.km).toBeGreaterThan(0);
    expect(asked.route.mapsUrl).toContain("google.com/maps/dir/");
    expect(asked.route.mapsUrl).not.toContain("33.886900,35.520300");

    // The customer sees everything.
    const own = await orderView(admin, await fresh(order.id), "seeker", customer.id);
    expect(own.dropoff).toMatchObject({ approximate: false, address: "Sassine Square, Achrafieh", contactPhone: "+961 3 333 333" });

    // The rider who confirms sees everything too, with directions to the exact drop-off.
    await providerAction(admin, await fresh(order.id), { userId: near.user.id, role: "provider" }, "offer", { priceUsd: 5, etaMinutes: 20 });
    const { offers } = await orderView(admin, await fresh(order.id), "seeker", customer.id);
    await seekerAction(admin, await fresh(order.id), { userId: customer.id, role: "seeker" }, "select", { recipientId: offers.find((o) => o.profileId === near.profileId)!.recipientId });
    const reserved = await orderView(admin, await fresh(order.id), "provider", near.user.id);
    expect(reserved.dropoff?.approximate).toBe(true);
    await providerAction(admin, await fresh(order.id), { userId: near.user.id, role: "provider" }, "confirm", {});
    const confirmed = await orderView(admin, await fresh(order.id), "provider", near.user.id);
    expect(confirmed.dropoff).toMatchObject({ approximate: false, address: "Sassine Square, Achrafieh", contactName: "Lina", contactPhone: "+961 3 333 333" });
    expect(confirmed.pickup.contactPhone).toBe("+961 1 111 111");
    expect(confirmed.route.mapsUrl).toContain("33.886900,35.520300");
    await admin.from("errand_orders").update({ status: "cancelled" }).eq("id", order.id);
  });

  it("keeps every order table away from clients", async () => {
    for (const table of ["errand_orders", "errand_order_recipients", "errand_order_events", "errand_settings"] as const) {
      const { data } = await customer.client.from(table).select("*");
      expect(data ?? []).toEqual([]);
    }
  });
});

describe("saved places", () => {
  it("keeps a customer's recent places, without repeats or contact details, and only for them", async () => {
    const someone = await createUser("places-owner");
    const other = await createUser("places-other");
    const shop = { point: { lat: 33.8966, lng: 35.4823 }, address: "Hamra Street", name: "Pharmacy Mazen" };
    const home = { point: { lat: 33.8869, lng: 35.5203 }, address: "Sassine Square" };
    await rememberRecentPlaces(admin, someone.id, [shop, home]);
    // The same shop again (a few metres off) doesn't add a second one.
    await rememberRecentPlaces(admin, someone.id, [{ ...shop, point: { lat: 33.89661, lng: 35.48231 } }]);
    let mine = await savedPlaces(admin, someone.id);
    expect(mine.filter((p) => p.kind === "recent")).toHaveLength(2);
    expect(mine.some((p) => p.name === "Pharmacy Mazen")).toBe(true);
    expect(await savedPlaces(admin, other.id)).toEqual([]);

    // Only the last 5.
    for (let i = 0; i < 7; i++) await rememberRecentPlaces(admin, someone.id, [{ point: { lat: 33 + i / 10, lng: 35.5 }, address: `Place ${i}` }]);
    mine = await savedPlaces(admin, someone.id);
    expect(mine.filter((p) => p.kind === "recent")).toHaveLength(5);

    // Home comes first and isn't repeated as a recent place.
    await admin.from("saved_places").insert({ user_id: someone.id, kind: "home", lat: 34.5, lng: 35.9, address: "My home" });
    await rememberRecentPlaces(admin, someone.id, [{ point: { lat: 34.5, lng: 35.9 }, address: "My home" }]);
    mine = await savedPlaces(admin, someone.id);
    expect(mine[0]!.kind).toBe("home");
    expect(mine.filter((p) => p.address === "My home")).toHaveLength(1);

    // One Home per person, and no client can read the table.
    const { error } = await admin.from("saved_places").insert({ user_id: someone.id, kind: "home", lat: 34, lng: 35 });
    expect(error?.code).toBe("23505");
    const { data } = await someone.client.from("saved_places").select("*");
    expect(data ?? []).toEqual([]);
  });
});

describe("ordering without filling in a request first", () => {
  it("makes a new customer's Delivery & Errands request from their first order, asking for a name only when there's none", async () => {
    [beirut, baabda, tripoli] = await Promise.all([district("LB11"), district("LB32"), district("LB56")]);
    const newcomer = await createUser("order-first-time");
    const order = {
      service: "delivery",
      description: "A folder of documents",
      pickupDistrictId: beirut.id,
      pickupDetail: "Hamra",
      dropoffDetail: "Sassine",
      timing: "asap",
    };
    expect(await ensureErrandRequestProfile(admin, newcomer.id, order)).toMatchObject({ ok: false, code: "name_required" });

    const made = await ensureErrandRequestProfile(admin, newcomer.id, { ...order, fullName: "Maya Saade" });
    expect(made.ok).toBe(true);
    const { data: profile } = await admin
      .from("generic_profiles")
      .select("full_name, role, status, moderation_status, attributes, categories(slug)")
      .eq("id", (made as { profileId: string }).profileId)
      .single();
    expect(profile).toMatchObject({ full_name: "Maya Saade", role: "seeker", status: "active", moderation_status: "approved", categories: { slug: "errands" } });
    expect(profile!.attributes).toMatchObject({ errandService: "delivery", jobDescription: "A folder of documents", districtId: beirut.id, pickupPlace: "Hamra", dropoffPlace: "Sassine" });
    // It counts as their request: they can order (and are seen) as a customer.
    expect((await myErrandProfiles(admin, newcomer.id)).seeker?.id).toBe((made as { profileId: string }).profileId);

    // A second order reuses it, as it is.
    const again = await ensureErrandRequestProfile(admin, newcomer.id, { ...order, description: "Keys" });
    expect(again).toMatchObject({ ok: true, profileId: (made as { profileId: string }).profileId });
  });
});

describe("waves and timers", () => {
  let customer: TestUser;
  let customerProfile: string;
  let first: Awaited<ReturnType<typeof provider>>;
  let second: Awaited<ReturnType<typeof provider>>;
  let further: Awaited<ReturnType<typeof provider>>;
  const asCustomer = () => ({ userId: customer.id, role: "seeker" as const });
  const asProvider = (p: { user: TestUser }) => ({ userId: p.user.id, role: "provider" as const });
  const past = () => new Date(Date.now() - 1000).toISOString();

  async function recipients(orderId: string) {
    const { data } = await admin.from("errand_order_recipients").select("*").eq("order_id", orderId).order("rank");
    return data ?? [];
  }
  const statusOf = async (orderId: string, p: { profileId: string }) =>
    (await recipients(orderId)).find((r) => r.provider_profile_id === p.profileId)?.status;

  async function start() {
    // "queue" so only this block's providers are eligible.
    const order = await placeOrder(customer, customerProfile, beirut, "queue");
    await nextWaveOrClose(admin, order, asCustomer());
    return fresh(order.id);
  }

  beforeAll(async () => {
    await useSettings({ wave_size: 2, response_seconds: 60, choose_seconds: 60, confirm_seconds: 60, initial_radius_km: 1, radius_step_km: 1, max_radius_km: 60 });
    [beirut, baabda, tripoli] = await Promise.all([district("LB11"), district("LB32"), district("LB56")]);
    customer = await createUser("wave-customer");
    customerProfile = await createProfile(customer, "errands", "seeker", { errandService: "queue", districtId: beirut.id });
    first = await provider("wave-first", beirut, { services: ["queue"] });
    second = await provider("wave-second", beirut, { services: ["queue"] });
    // Lives in Baabda, covers Beirut: only reached once the radius widens.
    further = await provider("wave-further", baabda, { services: ["queue"], cover: [beirut.id] });
  });

  it("sends the first wave to the nearest providers, with a deadline", async () => {
    const order = await start();
    expect(order.wave).toBe(1);
    expect(Number(order.radius_km)).toBe(1);
    expect(Date.parse(order.wave_until!)).toBeGreaterThan(Date.now() + 50_000);
    const sent = await recipients(order.id);
    expect(sent.map((r) => r.provider_profile_id).sort()).toEqual([first.profileId, second.profileId].sort());
    expect(sent.every((r) => r.wave === 1)).toBe(true);
    const seen = await orderView(admin, order, "provider", first.user.id);
    expect(seen.mine?.respondBy).toBe(order.wave_until);
  });

  it("asks the next nearest when nobody answers in time, widening the search", async () => {
    const order = await start();
    await admin.from("errand_orders").update({ wave_until: past() }).eq("id", order.id);
    await advanceOrders(admin, { orderId: order.id });
    const after = await fresh(order.id);
    expect(after.wave).toBe(2);
    const sent = await recipients(order.id);
    const far = sent.find((r) => r.provider_profile_id === further.profileId)!;
    expect(far.wave).toBe(2);
    // Widened one step at a time until Baabda was inside.
    expect(Number(after.radius_km)).toBeGreaterThanOrEqual(Number(far.distance_km));
    expect(Number(after.radius_km)).toBeLessThan(Number(far.distance_km) + 1);
    expect(await statusOf(order.id, first)).toBe("expired");
    expect(await statusOf(order.id, second)).toBe("expired");
    const { data: events } = await admin.from("errand_order_events").select("type").eq("order_id", order.id);
    expect(events!.map((e) => e.type)).toEqual(expect.arrayContaining(["wave_sent", "no_response"]));
    // A provider whose time ran out can't offer any more.
    expect((await providerAction(admin, after, asProvider(first), "offer", { priceUsd: 5, etaMinutes: 20 })).ok).toBe(false);
  });

  it("moves on at once when everyone in the wave declines", async () => {
    const order = await start();
    await providerAction(admin, await fresh(order.id), asProvider(first), "decline", {});
    expect((await fresh(order.id)).wave).toBe(1);
    await providerAction(admin, await fresh(order.id), asProvider(second), "decline", {});
    expect((await fresh(order.id)).wave).toBe(2);
  });

  it("gives the customer a time to choose once offers are in; unchosen offers lapse and the search carries on", async () => {
    const order = await start();
    await providerAction(admin, await fresh(order.id), asProvider(first), "offer", { priceUsd: 6, etaMinutes: 30 });
    // Still waiting on the second provider: no choosing window yet.
    expect((await fresh(order.id)).choose_until).toBeNull();
    await admin.from("errand_orders").update({ wave_until: past() }).eq("id", order.id);
    await advanceOrders(admin, { orderId: order.id });
    const choosing = await fresh(order.id);
    expect(choosing.choose_until).not.toBeNull();
    expect(choosing.wave).toBe(1);
    expect(await statusOf(order.id, second)).toBe("expired");
    // The customer is nudged to choose before the offers lapse.
    const { data: nudges } = await admin
      .from("notifications")
      .select("payload")
      .eq("user_id", customer.id)
      .eq("type", "errand_status")
      .contains("payload", { order_id: order.id, status: "choose" });
    expect(nudges).toHaveLength(1);

    await admin.from("errand_orders").update({ choose_until: past() }).eq("id", order.id);
    await advanceOrders(admin, { orderId: order.id });
    const after = await fresh(order.id);
    expect(after.choose_until).toBeNull();
    expect(after.wave).toBe(2);
    expect(await statusOf(order.id, first)).toBe("offer_expired");
  });

  it("starts the choosing time as soon as everyone has answered", async () => {
    const order = await start();
    await providerAction(admin, await fresh(order.id), asProvider(first), "offer", { priceUsd: 6, etaMinutes: 30 });
    await providerAction(admin, await fresh(order.id), asProvider(second), "decline", {});
    expect((await fresh(order.id)).choose_until).not.toBeNull();
  });

  it("lets the reservation lapse when the chosen provider doesn't confirm in time", async () => {
    const order = await start();
    await providerAction(admin, await fresh(order.id), asProvider(first), "offer", { priceUsd: 6, etaMinutes: 30 });
    await providerAction(admin, await fresh(order.id), asProvider(second), "offer", { priceUsd: 7, etaMinutes: 20 });
    const { offers } = await orderView(admin, await fresh(order.id), "seeker", customer.id);
    const pick = offers.find((o) => o.profileId === first.profileId)!;
    expect((await seekerAction(admin, await fresh(order.id), asCustomer(), "select", { recipientId: pick.recipientId })).ok).toBe(true);
    const reserved = await fresh(order.id);
    expect(reserved.status).toBe("reserved");
    expect(reserved.confirm_until).not.toBeNull();
    // Other providers no longer can offer while it's reserved.
    expect((await providerAction(admin, reserved, asProvider(second), "offer", { priceUsd: 3, etaMinutes: 20 })).ok).toBe(false);

    await admin.from("errand_orders").update({ confirm_until: past() }).eq("id", order.id);
    await advanceOrders(admin, { orderId: order.id });
    const after = await fresh(order.id);
    expect(after.status).toBe("open");
    expect(after.provider_profile_id).toBeNull();
    expect(await statusOf(order.id, first)).toBe("refused");
    // The other offer still stands, with a fresh time to choose it.
    expect(await statusOf(order.id, second)).toBe("offered");
    expect(after.choose_until).not.toBeNull();
    // Too late for the first provider to confirm now.
    expect((await providerAction(admin, after, asProvider(first), "confirm", {})).ok).toBe(false);
  });

  it("lets an admin send the next wave now, or search further", async () => {
    const order = await start();
    const asAdmin = { userId: customer.id, role: "admin" as const };
    expect((await adminAction(admin, await fresh(order.id), asAdmin, "widen", {})).ok).toBe(true);
    const after = await fresh(order.id);
    expect(after.wave).toBe(2);
    expect(Number(after.radius_km)).toBeGreaterThan(1);
    expect(await statusOf(order.id, further)).toBe("sent");
    // Nobody else is left to ask.
    expect((await adminAction(admin, await fresh(order.id), asAdmin, "resend", {})).ok).toBe(false);
  });

  it("closes as no provider when nobody is left to ask", async () => {
    const order = await placeOrder(customer, customerProfile, tripoli, "queue");
    expect(await nextWaveOrClose(admin, order, asCustomer(), { quiet: true })).toBe(0);
    expect((await fresh(order.id)).status).toBe("no_provider");
  });

  it("limits how many orders a rider has at once, as the admin sets it", async () => {
    const inProgress = async () => {
      const order = await placeOrder(customer, customerProfile, beirut, "queue");
      return admin
        .from("errand_orders")
        .update({ status: "accepted", provider_profile_id: second.profileId, provider_user_id: second.user.id })
        .eq("id", order.id);
    };
    expect((await inProgress()).error).toBeNull();
    // One at a time: the second is refused.
    expect((await inProgress()).error?.code).toBe("23505");
    await useSettings({ wave_size: 2, max_active_orders: 2 });
    expect((await inProgress()).error).toBeNull();
    expect((await inProgress()).error?.code).toBe("23505");
    await admin.from("errand_orders").update({ status: "cancelled" }).eq("provider_profile_id", second.profileId);
  });

  it("carries on at once when every offer is withdrawn while the customer is choosing", async () => {
    await useSettings({ wave_size: 2, response_seconds: 60, choose_seconds: 60, confirm_seconds: 60, initial_radius_km: 1, radius_step_km: 1, max_radius_km: 60 });
    const order = await start();
    await providerAction(admin, await fresh(order.id), asProvider(first), "offer", { priceUsd: 6, etaMinutes: 30 });
    await providerAction(admin, await fresh(order.id), asProvider(second), "decline", {});
    expect((await fresh(order.id)).choose_until).not.toBeNull();
    await providerAction(admin, await fresh(order.id), asProvider(first), "withdraw", {});
    const after = await fresh(order.id);
    expect(after.choose_until).toBeNull();
    expect(after.wave).toBe(2);
  });

  it("takes a rider who confirms another order out of the requests still waiting on them", async () => {
    const waiting = await start();
    // The other rider has answered; the order now waits only on `first`.
    await providerAction(admin, await fresh(waiting.id), asProvider(second), "decline", {});
    expect((await fresh(waiting.id)).wave).toBe(1);

    const other = await start();
    await providerAction(admin, await fresh(other.id), asProvider(first), "offer", { priceUsd: 5, etaMinutes: 15 });
    const { offers } = await orderView(admin, await fresh(other.id), "seeker", customer.id);
    const pick = offers.find((o) => o.profileId === first.profileId)!;
    await seekerAction(admin, await fresh(other.id), asCustomer(), "select", { recipientId: pick.recipientId });
    expect((await providerAction(admin, await fresh(other.id), asProvider(first), "confirm", {})).ok).toBe(true);

    expect(await statusOf(waiting.id, first)).toBe("withdrawn");
    // No 2-minute wait: the next wave went out straight away.
    expect((await fresh(waiting.id)).wave).toBe(2);
    await admin.from("errand_orders").update({ status: "cancelled" }).eq("id", other.id);
  });
});

describe("repair quotes (Home Maintenance)", () => {
  let customer: TestUser;
  let local: { user: TestUser; profileId: string };
  let elsewhere: { user: TestUser; profileId: string };
  const asCustomer = () => ({ userId: customer.id, role: "seeker" as const });

  async function tradesperson(tag: string, home: typeof beirut, trades: string[]) {
    const user = await createUser(tag);
    const profileId = await createProfile(user, "maintenance", "provider", { trades, districtId: home.id });
    await admin.from("generic_profiles").update({ location_id: home.parent_location_id }).eq("id", profileId);
    return { user, profileId };
  }

  async function placeJob(service: string, district: typeof beirut) {
    const made = await ensureJobRequestProfile(admin, customer.id, {
      service,
      description: "The kitchen tap is leaking",
      pickupDistrictId: district.id,
      timing: "asap",
      fullName: "Job Customer",
    });
    if (!made.ok) throw new Error(made.error);
    const { data } = await admin
      .from("errand_orders")
      .insert({
        seeker_user_id: customer.id,
        seeker_profile_id: made.profileId,
        category: "maintenance",
        service,
        description: "The kitchen tap is leaking",
        pickup_district_id: district.id,
        timing: "asap",
        open_until: new Date(Date.now() + 86_400_000).toISOString(),
      })
      .select("*")
      .single();
    return data!;
  }

  beforeAll(async () => {
    [beirut, baabda, tripoli] = await Promise.all([district("LB11"), district("LB32"), district("LB56")]);
    customer = await createUser("job-customer");
    // No Available switch for tradespeople: available_now stays false.
    local = await tradesperson("job-plumber-beirut", beirut, ["plumber"]);
    // Baabda is in Mount Lebanon, not Beirut: a different governorate.
    elsewhere = await tradesperson("job-plumber-baabda", baabda, ["plumber"]);
    await tradesperson("job-electrician-beirut", beirut, ["electrician"]);
  });

  it("makes the customer's maintenance request from the job, live straight away, and needs a name when there's none", async () => {
    const stranger = await createUser("job-noname");
    const missing = await ensureJobRequestProfile(admin, stranger.id, {
      service: "plumber",
      description: "Leak",
      pickupDistrictId: beirut.id,
      timing: "asap",
    });
    expect(missing).toMatchObject({ ok: false, code: "name_required" });

    await placeJob("plumber", beirut);
    const { data: profile } = await admin
      .from("generic_profiles")
      .select("full_name, status, moderation_status, attributes, categories(slug)")
      .eq("user_id", customer.id)
      .eq("role", "seeker")
      .single();
    expect(profile).toMatchObject({ full_name: "Job Customer", status: "active", moderation_status: "approved", categories: { slug: "maintenance" } });
    expect((profile!.attributes as { tradesNeeded: string[] }).tradesNeeded).toEqual(["plumber"]);
  });

  it("goes to tradespeople of that trade in the area, with no Available switch", async () => {
    const job = await placeJob("plumber", beirut);
    expect(await dispatchOrder(admin, job, asCustomer())).toBeGreaterThanOrEqual(1);
    const { data: sent } = await admin.from("errand_order_recipients").select("provider_profile_id").eq("order_id", job.id);
    const ids = (sent ?? []).map((r) => r.provider_profile_id);
    expect(ids).toContain(local.profileId);
    expect(ids).not.toContain(elsewhere.profileId);
  });

  it("takes a quote with a range and a visit time, and runs the job to completed", async () => {
    const job = await placeJob("plumber", beirut);
    await dispatchOrder(admin, job, asCustomer());
    const asPro = { userId: local.user.id, role: "provider" as const };

    // A quote needs a visit time, and the range must make sense.
    expect((await providerAction(admin, await fresh(job.id), asPro, "offer", { priceUsd: 20 })).ok).toBe(false);
    const visitAt = new Date(Date.now() + 3 * 3600_000).toISOString();
    expect((await providerAction(admin, await fresh(job.id), asPro, "offer", { priceUsd: 30, priceMaxUsd: 20, visitAt })).ok).toBe(false);
    expect((await providerAction(admin, await fresh(job.id), asPro, "offer", { priceUsd: 20, priceMaxUsd: 30, visitAt })).ok).toBe(true);

    const seen = await orderView(admin, await fresh(job.id), "seeker", customer.id);
    expect(seen.category).toBe("maintenance");
    expect(seen.offers[0]).toMatchObject({ priceUsd: 20, priceMaxUsd: 30 });
    expect(Date.parse(seen.offers[0]!.visitAt!)).toBe(Date.parse(visitAt));

    expect((await seekerAction(admin, await fresh(job.id), asCustomer(), "select", { recipientId: seen.offers[0]!.recipientId })).ok).toBe(true);
    expect((await providerAction(admin, await fresh(job.id), asPro, "confirm", {})).ok).toBe(true);
    // Nothing to pick up on a repair: on the way, arrived, done.
    for (const expected of ["on_the_way", "arrived", "delivered"]) {
      expect((await providerAction(admin, await fresh(job.id), asPro, "advance", {})).ok).toBe(true);
      expect((await fresh(job.id)).status).toBe(expected);
    }
    expect((await seekerAction(admin, await fresh(job.id), asCustomer(), "complete", {})).ok).toBe(true);
    expect((await fresh(job.id)).status).toBe("completed");
  });

  it("lets a tradesperson take more than one job at a time", async () => {
    const asPro = { userId: local.user.id, role: "provider" as const };
    const visitAt = new Date(Date.now() + 3600_000).toISOString();
    for (let i = 0; i < 2; i++) {
      const job = await placeJob("plumber", beirut);
      await dispatchOrder(admin, job, asCustomer());
      expect((await providerAction(admin, await fresh(job.id), asPro, "offer", { priceUsd: 15, visitAt })).ok).toBe(true);
      const { offers } = await orderView(admin, await fresh(job.id), "seeker", customer.id);
      const mine = offers.find((o) => o.profileId === local.profileId)!;
      expect((await seekerAction(admin, await fresh(job.id), asCustomer(), "select", { recipientId: mine.recipientId })).ok).toBe(true);
      expect((await providerAction(admin, await fresh(job.id), asPro, "confirm", {})).ok).toBe(true);
    }
    const { count } = await admin
      .from("errand_orders")
      .select("id", { count: "exact", head: true })
      .eq("provider_profile_id", local.profileId)
      .eq("status", "accepted");
    expect(count).toBe(2);
  });
});
