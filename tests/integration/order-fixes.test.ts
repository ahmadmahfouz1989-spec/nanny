import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createProfile, createUser, type TestUser, parkProviders } from "./helpers";
import { advanceOrders, scheduledSendAt, tickOrder } from "@/lib/errand-orders";
import { orderView } from "@/lib/errand-order-view";
import { seekerAction } from "@/lib/errand-order-actions";

// Scheduled deliveries wait for their time, delivered ones close by
// themselves, a ride's pickup stays private until confirmed, and errors
// come with a code the screen can translate.

const place = async (code: string) => (await admin.from("locations").select("id, parent_location_id").eq("code", code).single()).data!;
const hours = (n: number) => new Date(Date.now() + n * 3_600_000).toISOString();

describe("delivery fixes", () => {
  let baabda: Awaited<ReturnType<typeof place>>;
  let customer: TestUser, riderUser: TestUser;
  let request: string, rider: string;

  async function order(fields: Record<string, unknown> = {}) {
    const { data, error } = await admin
      .from("errand_orders")
      .insert({
        seeker_user_id: customer.id,
        seeker_profile_id: request,
        service: "delivery",
        description: "A bag from home",
        pickup_district_id: baabda.id,
        dropoff_district_id: baabda.id,
        timing: "asap",
        open_until: hours(1),
        ...fields,
      })
      .select("*")
      .single();
    if (error) throw error;
    return data!;
  }
  const row = async (id: string) => (await admin.from("errand_orders").select("*").eq("id", id).single()).data!;
  const asked = async (id: string) => (await admin.from("errand_order_recipients").select("provider_profile_id").eq("order_id", id)).data!.length;

  beforeAll(async () => {
    await parkProviders();
    baabda = await place("LB32");
    customer = await createUser("fix-customer");
    request = await createProfile(customer, "errands", "seeker", { errandService: "delivery", districtId: baabda.id });
    riderUser = await createUser("fix-rider");
    rider = await createProfile(riderUser, "errands", "provider", { errandServices: ["delivery", "moto_taxi"], districtId: baabda.id });
    await admin.from("generic_profiles").update({ location_id: baabda.parent_location_id, available_now: true }).eq("id", rider);
  });
  afterAll(cleanupUsers);

  it("a scheduled delivery waits until an hour before its time, then goes out", async () => {
    const at = hours(3);
    const sendAt = scheduledSendAt("scheduled", at)!;
    expect(Date.parse(sendAt)).toBeCloseTo(Date.parse(at) - 3_600_000, -3);
    // Within the hour: at once.
    expect(scheduledSendAt("scheduled", hours(0.5))).toBeNull();
    expect(scheduledSendAt("asap", at)).toBeNull();

    const o = await order({ timing: "scheduled", scheduled_at: at, wave_until: sendAt, open_until: hours(3) });
    await tickOrder(admin, o);
    expect(await asked(o.id)).toBe(0);
    expect((await row(o.id)).status).toBe("open");
    const view = await orderView(admin, await row(o.id), "seeker", customer.id);
    expect(view.matching?.sendAt).toBe(sendAt.replace("Z", "+00:00"));

    // Its time comes: the first wave goes out.
    await admin.from("errand_orders").update({ wave_until: hours(-0.01) }).eq("id", o.id);
    await advanceOrders(admin, { orderId: o.id });
    expect(await asked(o.id)).toBe(1);
    expect((await orderView(admin, await row(o.id), "seeker", customer.id)).matching?.sendAt).toBeNull();
  });

  it("Try again on an order whose time has passed sends it now, as soon as possible", async () => {
    const o = await order({ timing: "scheduled", scheduled_at: hours(-2), status: "cancelled", cancelled_by: "seeker" });
    const result = await seekerAction(admin, o, { userId: customer.id, role: "seeker" }, "retry", {});
    expect(result.ok).toBe(true);
    const copy = await row((result as { orderId: string }).orderId);
    expect(copy.timing).toBe("asap");
    expect(copy.scheduled_at).toBeNull();
  });

  it("a delivered order nobody confirmed completes by itself after 2 hours", async () => {
    await admin.from("errand_orders").update({ status: "completed" }).eq("provider_profile_id", rider).neq("status", "completed");
    const late = await order({ status: "delivered", provider_profile_id: rider, provider_user_id: riderUser.id, status_changed_at: hours(-3) });
    const recent = await order({ status: "delivered", provider_profile_id: rider, provider_user_id: riderUser.id, status_changed_at: hours(-0.5) });
    await advanceOrders(admin, { orderIds: [late.id, recent.id] });
    const done = await row(late.id);
    expect(done.status).toBe("completed");
    expect(done.number).not.toBeNull();
    expect((await row(recent.id)).status).toBe("delivered");
  });

  it("riders asked about a ride see the passenger's area, not their exact spot", async () => {
    const o = await order({
      service: "moto_taxi",
      pickup_lat: 33.8331,
      pickup_lng: 35.5442,
      pickup_address: "Home street 5",
      pickup_instructions: "Blue gate",
    });
    const seen = await orderView(admin, o, "provider", riderUser.id);
    expect(seen.pickup.approximate).toBe(true);
    expect(seen.pickup.address).toBeNull();
    expect(seen.pickup.instructions).toBeNull();
    expect(seen.pickup.point).not.toEqual({ lat: 33.8331, lng: 35.5442 });
    // A delivery's pickup (usually a shop) is still shown exactly.
    const shop = await order({ pickup_lat: 33.8331, pickup_lng: 35.5442, pickup_address: "Shop street 1" });
    expect((await orderView(admin, shop, "provider", riderUser.id)).pickup.address).toBe("Shop street 1");
  });

  it("errors carry a code for the screen to translate", async () => {
    const o = await order();
    const result = await seekerAction(admin, o, { userId: customer.id, role: "seeker" }, "complete", {});
    expect(result).toMatchObject({ ok: false, status: 409, code: "complete_after_delivered" });
  });
});
