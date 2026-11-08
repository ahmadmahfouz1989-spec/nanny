import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createProfile, createUser, type TestUser, parkProviders } from "./helpers";
import { eligibleProviders, nextWaveOrClose } from "@/lib/errand-orders";

// A customer sends a delivery to one rider they picked: it reaches that
// rider only, wherever they work, and ends when they can't take it.

const place = async (code: string) => (await admin.from("locations").select("id, parent_location_id").eq("code", code).single()).data!;
const asCustomer = (u: TestUser) => ({ userId: u.id, role: "seeker" as const });

describe("sending an order to a rider you choose", () => {
  let baabda: Awaited<ReturnType<typeof place>>, tripoli: Awaited<ReturnType<typeof place>>;
  let customer: TestUser;
  let request: string;
  let covering: string;

  async function rider(tag: string, attrs: Record<string, unknown>, governorate: string | null) {
    const user = await createUser(tag);
    const id = await createProfile(user, "errands", "provider", { errandServices: ["delivery"], ...attrs });
    await admin.from("generic_profiles").update({ location_id: governorate, available_now: true }).eq("id", id);
    return id;
  }
  async function order(chosen: string | null) {
    const { data } = await admin
      .from("errand_orders")
      .insert({
        seeker_user_id: customer.id,
        seeker_profile_id: request,
        service: "delivery",
        description: "A bag from home",
        pickup_district_id: baabda.id,
        dropoff_district_id: baabda.id,
        timing: "asap",
        open_until: new Date(Date.now() + 3600_000).toISOString(),
        chosen_provider_profile_id: chosen,
      })
      .select("*")
      .single();
    return data!;
  }
  const askedIn = async (id: string) => (await admin.from("errand_order_recipients").select("provider_profile_id").eq("order_id", id)).data!.map((r) => r.provider_profile_id);
  const row = async (id: string) => (await admin.from("errand_orders").select("*").eq("id", id).single()).data!;

  beforeAll(async () => {
    await parkProviders();
    [baabda, tripoli] = await Promise.all([place("LB32"), place("LB56")]);
    customer = await createUser("chosen-customer");
    request = await createProfile(customer, "errands", "seeker", { errandService: "delivery", districtId: baabda.id });
    covering = await rider("chosen-covering", { districtId: baabda.id }, baabda.parent_location_id);
  });
  afterAll(cleanupUsers);

  it("goes only to the chosen rider, even one far away who covers somewhere else", async () => {
    const far = await rider("chosen-far", { districtId: tripoli.id }, tripoli.parent_location_id);
    const o = await order(far);
    expect(await nextWaveOrClose(admin, o, asCustomer(customer), { quiet: true })).toBe(1);
    expect(await askedIn(o.id)).toEqual([far]);

    // They didn't take it: nobody else is asked, the order ends.
    expect(await nextWaveOrClose(admin, await row(o.id), asCustomer(customer), { quiet: true })).toBe(0);
    expect((await row(o.id)).status).toBe("no_provider");
    expect(await askedIn(o.id)).not.toContain(covering);
  });

  it("reaches a rider with no district saved", async () => {
    const noDistrict = await rider("chosen-nodistrict", {}, baabda.parent_location_id);
    const o = await order(noDistrict);
    expect(await nextWaveOrClose(admin, o, asCustomer(customer), { quiet: true })).toBe(1);
    expect(await askedIn(o.id)).toEqual([noDistrict]);
  });

  it("a chosen rider who is switched to Offline still gets it, and is in the picker", async () => {
    const off = await rider("chosen-off", { districtId: baabda.id }, baabda.parent_location_id);
    await admin.from("generic_profiles").update({ available_now: false }).eq("id", off);
    const asked = { service: "delivery" as const, pickupDistrictId: baabda.id, pickupAreaId: null, seekerUserId: customer.id };
    expect((await eligibleProviders(admin, asked, { limit: 1, only: off })).map((c) => c.profileId)).toEqual([off]);
    const list = (await eligibleProviders(admin, asked, { limit: 500, anywhere: true })).map((c) => c.profileId);
    expect(list).toContain(covering);
    expect(list).toContain(off);

    const o = await order(off);
    expect(await nextWaveOrClose(admin, o, asCustomer(customer), { quiet: true })).toBe(1);
    expect(await askedIn(o.id)).toEqual([off]);
  });

  it("a suspended chosen rider gets nothing", async () => {
    const gone = await rider("chosen-suspended", { districtId: baabda.id }, baabda.parent_location_id);
    const { data: p } = await admin.from("generic_profiles").select("user_id").eq("id", gone).single();
    await admin.from("users").update({ status: "suspended" }).eq("id", p!.user_id);
    const o = await order(gone);
    expect(await nextWaveOrClose(admin, o, asCustomer(customer), { quiet: true })).toBe(0);
    expect((await row(o.id)).status).toBe("no_provider");
  });
});
