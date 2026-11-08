import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createProfile, createUser, type TestUser } from "./helpers";
import { eligibleProviders, offlineUnresponsive } from "@/lib/errand-orders";

// Dispatch that knows where riders are: a rider's shared position (within
// their own range) counts like covering the district, riders who let
// requests run out rank lower and go Offline, and stale positions don't count.

const place = async (code: string) => (await admin.from("locations").select("id, parent_location_id, lat, lon").eq("code", code).single()).data!;
const CHIYAH = { lat: 33.8547, lng: 35.5117 };

describe("riders' live location", () => {
  let baabda: Awaited<ReturnType<typeof place>>, tripoli: Awaited<ReturnType<typeof place>>;
  let customer: TestUser;
  let request: string;

  async function rider(tag: string, attrs: Record<string, unknown>, governorate: string) {
    const user = await createUser(tag);
    const id = await createProfile(user, "errands", "provider", { errandServices: ["delivery"], ...attrs });
    await admin.from("generic_profiles").update({ location_id: governorate, available_now: true, available_changed_at: new Date(Date.now() - 3600_000).toISOString() }).eq("id", id);
    return { id, user };
  }
  const at = (id: string, lat: number, lng: number, minutesAgo = 0) =>
    admin.from("rider_locations").upsert({ profile_id: id, lat, lng, located_at: new Date(Date.now() - minutesAgo * 60_000).toISOString() });
  const asked = () => ({ service: "delivery" as const, pickupDistrictId: baabda.id, pickupAreaId: null, seekerUserId: customer.id, pickupPoint: CHIYAH });
  const reached = async () => (await eligibleProviders(admin, asked(), { limit: 500, maxActive: 1 })).map((c) => c.profileId);

  beforeAll(async () => {
    [baabda, tripoli] = await Promise.all([place("LB32"), place("LB56")]);
    customer = await createUser("live-customer");
    request = await createProfile(customer, "errands", "seeker", { errandService: "delivery", districtId: baabda.id });
  });
  afterAll(cleanupUsers);

  it("a rider based far away but near the pickup right now gets it", async () => {
    const { id } = await rider("live-near", { districtId: tripoli.id }, tripoli.parent_location_id!);
    expect(await reached()).not.toContain(id);
    await at(id, 33.86, 35.52);
    expect(await reached()).toContain(id);
    const me = (await eligibleProviders(admin, asked(), { limit: 500, maxActive: 1 })).find((c) => c.profileId === id)!;
    expect(me.live).toBe(true);
    expect(me.distanceKm).toBeLessThan(2);
  });

  it("a rider with no district saved can get orders through their location", async () => {
    // (One in the pickup's own governorate already gets it by the older rule.)
    const { id } = await rider("live-nodistrict", {}, tripoli.parent_location_id!);
    expect(await reached()).not.toContain(id);
    await at(id, 33.85, 35.51);
    expect(await reached()).toContain(id);
  });

  it("not beyond their own range, and not from an old position", async () => {
    const { id: short } = await rider("live-short", { districtId: tripoli.id, maxDistanceKm: 3 }, tripoli.parent_location_id!);
    await at(short, 33.9, 35.55); // ~6 km from Chiyah
    expect(await reached()).not.toContain(short);
    const { id: stale } = await rider("live-stale", { districtId: tripoli.id }, tripoli.parent_location_id!);
    await at(stale, 33.855, 35.512, 90);
    expect(await reached()).not.toContain(stale);
  });

  it("a rider who lets requests run out ranks below one who answers", async () => {
    const { id: answers } = await rider("live-answers", { districtId: tripoli.id }, tripoli.parent_location_id!);
    const { id: ignores } = await rider("live-ignores", { districtId: tripoli.id }, tripoli.parent_location_id!);
    await at(answers, 33.86, 35.52);
    await at(ignores, 33.86, 35.52);
    const { data: o } = await admin
      .from("errand_orders")
      .insert({ seeker_user_id: customer.id, seeker_profile_id: request, service: "delivery", description: "A parcel", pickup_district_id: baabda.id, timing: "asap", open_until: new Date(Date.now() + 3600_000).toISOString() })
      .select("id")
      .single();
    const userOf = async (pid: string) => (await admin.from("generic_profiles").select("user_id").eq("id", pid).single()).data!.user_id;
    const rows = (pid: string, uid: string, status: string) =>
      [0, 1, 2, 3].map((i) => ({ order_id: o!.id, provider_profile_id: pid, provider_user_id: uid, status, rank: i + 1, sent_at: new Date(Date.now() - (10 - i) * 60_000).toISOString() }));
    // One order can hold each rider once: spread the history over orders.
    for (const [pid, status] of [[answers, "declined"], [ignores, "expired"]] as const) {
      const uid = await userOf(pid);
      for (const r of rows(pid, uid, status)) {
        const { data: other } = await admin
          .from("errand_orders")
          .insert({ seeker_user_id: customer.id, seeker_profile_id: request, service: "delivery", description: "A parcel", pickup_district_id: baabda.id, timing: "asap", status: "no_provider", open_until: new Date().toISOString() })
          .select("id")
          .single();
        await admin.from("errand_order_recipients").insert({ ...r, order_id: other!.id });
      }
    }
    const order = (await reached()).filter((id) => id === answers || id === ignores);
    expect(order).toEqual([answers, ignores]);

    // And after missing three in a row, they're switched Offline and told.
    const { data: full } = await admin.from("errand_orders").select("*").eq("id", o!.id).single();
    expect(await offlineUnresponsive(admin, [ignores, answers], full!)).toEqual([ignores]);
    const { data: p } = await admin.from("generic_profiles").select("available_now").eq("id", ignores).single();
    expect(p!.available_now).toBe(false);
    expect((await admin.from("rider_locations").select("profile_id").eq("profile_id", ignores)).data).toEqual([]);
    const { data: n } = await admin.from("notifications").select("payload").eq("user_id", await userOf(ignores)).eq("type", "errand_status");
    expect(n!.some((x) => (x.payload as { status?: string }).status === "auto_offline")).toBe(true);
  });
});
