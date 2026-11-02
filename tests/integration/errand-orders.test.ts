import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { dispatchOrder, eligibleProviders, closeExpiredOrders, myErrandProfiles } from "@/lib/errand-orders";
import { orderView } from "@/lib/errand-order-view";
import { adminAction, providerAction, seekerAction } from "@/lib/errand-order-actions";
import { ensureJobRequestProfile } from "@/lib/job-request-profile";
import { admin, cleanupUsers, createProfile, createUser, type TestUser } from "./helpers";

// Delivery & Errands orders, Phase 1: who receives an order and in what
// order, offers, choosing, confirming, the stages, dropping out, and that
// no client can read the tables directly.

afterAll(cleanupUsers);

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

async function placeOrder(seeker: TestUser, seekerProfileId: string, pickup: typeof beirut) {
  const { data } = await admin
    .from("errand_orders")
    .insert({
      seeker_user_id: seeker.id,
      seeker_profile_id: seekerProfileId,
      service: "delivery",
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
    expect(await dispatchOrder(admin, { ...order, service: "delivery" }, { userId: customer.id, role: "seeker" })).toBeGreaterThanOrEqual(2);

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
    await dispatchOrder(admin, { ...order, service: "delivery" }, { userId: customer.id, role: "seeker" });
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
    expect(await closeExpiredOrders(admin, { orderId: order.id })).toEqual([order.id]);
    expect((await fresh(order.id)).status).toBe("no_provider");
    const reopened = await adminAction(admin, await fresh(order.id), { userId: customer.id, role: "admin" }, "reopen", {});
    expect(reopened.ok).toBe(true);
  });

  it("keeps every order table away from clients", async () => {
    for (const table of ["errand_orders", "errand_order_recipients", "errand_order_events", "errand_settings"] as const) {
      const { data } = await customer.client.from(table).select("*");
      expect(data ?? []).toEqual([]);
    }
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

  it("makes the customer's maintenance request from the job, pending review, and needs a name when there's none", async () => {
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
    expect(profile).toMatchObject({ full_name: "Job Customer", status: "active", moderation_status: "pending", categories: { slug: "maintenance" } });
    expect((profile!.attributes as { tradesNeeded: string[] }).tradesNeeded).toEqual(["plumber"]);
  });

  it("goes to tradespeople of that trade in the area, with no Available switch", async () => {
    const job = await placeJob("plumber", beirut);
    expect(await dispatchOrder(admin, { ...job, service: "plumber" }, asCustomer())).toBeGreaterThanOrEqual(1);
    const { data: sent } = await admin.from("errand_order_recipients").select("provider_profile_id").eq("order_id", job.id);
    const ids = (sent ?? []).map((r) => r.provider_profile_id);
    expect(ids).toContain(local.profileId);
    expect(ids).not.toContain(elsewhere.profileId);
  });

  it("takes a quote with a range and a visit time, and runs the job to completed", async () => {
    const job = await placeJob("plumber", beirut);
    await dispatchOrder(admin, { ...job, service: "plumber" }, asCustomer());
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
      await dispatchOrder(admin, { ...job, service: "plumber" }, asCustomer());
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
