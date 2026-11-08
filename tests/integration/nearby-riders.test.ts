import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createProfile, createUser, parkProviders, type TestUser } from "./helpers";
import { DEFAULT_SETTINGS, eligibleProviders, nextWaveOrClose } from "@/lib/errand-orders";
import { orderView } from "@/lib/errand-order-view";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";

// Chiyah's order, for real: pickup in Baabda, riders who are close but only
// have Beirut ticked. Run alone: it changes the shared order settings.

const set = (values: Partial<typeof DEFAULT_SETTINGS>) => admin.from("errand_settings").update({ ...DEFAULT_SETTINGS, ...values }).eq("id", true);
const place = async (code: string) => (await admin.from("locations").select("id, parent_location_id, lat, lon").eq("code", code).single()).data!;
const CHIYAH = { lat: 33.8547, lng: 35.5117 };
const asCustomer = (u: TestUser) => ({ userId: u.id, role: "seeker" as const });

describe("riders near the pickup", () => {
  let beirut: Awaited<ReturnType<typeof place>>, baabda: Awaited<ReturnType<typeof place>>, tripoli: Awaited<ReturnType<typeof place>>;
  let customer: TestUser;
  let request: string;

  async function rider(tag: string, home: typeof beirut, opts: { cover?: string[]; available?: boolean; services?: string[] } = {}) {
    const user = await createUser(tag);
    const id = await createProfile(user, "errands", "provider", { errandServices: opts.services ?? ["delivery"], districtId: home.id, coverDistrictIds: opts.cover ?? [] });
    await admin.from("generic_profiles").update({ location_id: home.parent_location_id, available_now: opts.available ?? true }).eq("id", id);
    return id;
  }
  const parkAll = () => parkProviders();

  async function order() {
    const { data } = await admin
      .from("errand_orders")
      .insert({
        seeker_user_id: customer.id,
        seeker_profile_id: request,
        service: "delivery",
        description: "A bag from home",
        pickup_district_id: baabda.id,
        dropoff_district_id: baabda.id,
        pickup_lat: CHIYAH.lat,
        pickup_lng: CHIYAH.lng,
        timing: "asap",
        open_until: new Date(Date.now() + 3600_000).toISOString(),
      })
      .select("*")
      .single();
    return data!;
  }
  const askedIn = async (id: string) => (await admin.from("errand_order_recipients").select("provider_profile_id").eq("order_id", id)).data!.map((r) => r.provider_profile_id);
  const status = async (id: string) => (await admin.from("errand_orders").select("status").eq("id", id).single()).data!.status;

  beforeAll(async () => {
    [beirut, baabda, tripoli] = await Promise.all([place("LB11"), place("LB32"), place("LB56")]);
    await set({});
    await parkAll();
    customer = await createUser("nearby-customer");
    request = await createProfile(customer, "errands", "seeker", { errandService: "delivery", districtId: baabda.id });
  });
  afterAll(async () => {
    await set({});
    await cleanupUsers();
  });

  it("the order that failed: a close rider who only ticked Beirut now gets it", async () => {
    const hadi = await rider("nearby-beirut", beirut);
    const o = await order();
    expect(await nextWaveOrClose(admin, o, asCustomer(customer), { quiet: true })).toBe(1);
    expect(await askedIn(o.id)).toEqual([hadi]);
    expect(await status(o.id)).toBe("open");
    const { data: events } = await admin.from("errand_order_events").select("type, detail").eq("order_id", o.id).eq("type", "wave_sent");
    expect(events![0].detail).toMatchObject({ nearby_km: 10, count: 1 });
    await parkAll();
  });

  it("riders covering the district come first; close ones wait until they can't", async () => {
    const closeBy = await rider("nearby-second", beirut);
    const covering = await rider("nearby-covering", baabda);
    const o = await order();
    await nextWaveOrClose(admin, o, asCustomer(customer), { quiet: true });
    expect(await askedIn(o.id)).toEqual([covering]);
    const moved = (await admin.from("errand_orders").select("*").eq("id", o.id).single()).data!;
    expect(await nextWaveOrClose(admin, moved, asCustomer(customer), { quiet: true })).toBe(1);
    expect(await askedIn(o.id)).toEqual(expect.arrayContaining([covering, closeBy]));
    await parkAll();
  });

  it("too far, wrong service: still not asked, and the customer is told nobody was", async () => {
    await rider("nearby-far", tripoli);
    await rider("nearby-service", beirut, { services: ["queue"] });
    const o = await order();
    expect(await nextWaveOrClose(admin, o, asCustomer(customer), { quiet: true })).toBe(0);
    expect(await status(o.id)).toBe("no_provider");
    const fresh = (await admin.from("errand_orders").select("*").eq("id", o.id).single()).data!;
    expect((await orderView(admin, fresh, "seeker", customer.id)).sentTo).toBe(0);
    await parkAll();
  });

  it("a rider switched to Offline is still asked, after the Available ones", async () => {
    const off = await rider("nearby-offline", baabda, { available: false });
    const on = await rider("nearby-online", baabda);
    const asked = { service: "delivery" as const, pickupDistrictId: baabda.id, pickupAreaId: null, seekerUserId: customer.id, pickupPoint: CHIYAH };
    const order = (await eligibleProviders(admin, asked, { limit: 10, maxActive: 1 })).map((c) => c.profileId);
    expect(order).toEqual([on, off]);
    await parkAll();
  });

  it("a rider with only a region saved isn't assumed to be close", async () => {
    const user = await createUser("nearby-region");
    const id = await createProfile(user, "errands", "provider", { errandServices: ["delivery"] });
    await admin.from("generic_profiles").update({ location_id: beirut.parent_location_id, available_now: true }).eq("id", id);
    const o = await order();
    await nextWaveOrClose(admin, o, asCustomer(customer), { quiet: true });
    expect(await askedIn(o.id)).not.toContain(id);
    await parkAll();
  });

  it("0 turns it off, and the limit can be changed", async () => {
    await rider("nearby-setting", beirut);
    await set({ nearby_fallback_km: 0 });
    const off = await order();
    expect(await nextWaveOrClose(admin, off, asCustomer(customer), { quiet: true })).toBe(0);
    await set({ nearby_fallback_km: 0.1 });
    const tiny = await order();
    expect(await nextWaveOrClose(admin, tiny, asCustomer(customer), { quiet: true })).toBe(0);
    await set({});
    await parkAll();
  });

  it("the customer's view says how many were asked", async () => {
    await rider("nearby-count", beirut);
    const o = await order();
    await nextWaveOrClose(admin, o, asCustomer(customer), { quiet: true });
    const fresh = (await admin.from("errand_orders").select("*").eq("id", o.id).single()).data!;
    expect((await orderView(admin, fresh, "seeker", customer.id)).sentTo).toBe(1);
    await parkAll();
  });

  it("matches are still made for customers to find riders", async () => {
    const id = await rider("nearby-match", beirut);
    await recomputeGenericMatchesForProfile(request);
    expect((await admin.from("generic_matches").select("id").eq("seeker_profile_id", request).eq("provider_profile_id", id)).data).toHaveLength(1);
  });
});
