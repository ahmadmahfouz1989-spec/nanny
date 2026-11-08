import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createProfile, createUser, type TestUser } from "./helpers";
import { orderView } from "@/lib/errand-order-view";

// The rider on the customer's map: only the customer (and admins) see it,
// only mid-delivery, and the position is gone once the order is delivered.

describe("live rider tracking", () => {
  let customer: TestUser, rider: TestUser, stranger: TestUser, orderId: string;
  beforeAll(async () => {
    [customer, rider, stranger] = await Promise.all([createUser("track-customer"), createUser("track-rider"), createUser("track-stranger")]);
    const seeker = await createProfile(customer, "errands", "seeker", { errandService: "delivery" });
    const provider = await createProfile(rider, "errands", "provider", { errandServices: ["delivery"] });
    const { data: district } = await admin.from("locations").select("id").eq("level", "district").limit(1).single();
    const { data } = await admin
      .from("errand_orders")
      .insert({
        seeker_user_id: customer.id, seeker_profile_id: seeker, provider_user_id: rider.id, provider_profile_id: provider,
        service: "delivery", description: "A parcel", pickup_district_id: district!.id, pickup_lat: 33.88, pickup_lng: 35.5,
        timing: "asap", status: "on_the_way", open_until: new Date(Date.now() + 3600_000).toISOString(),
      })
      .select("id")
      .single();
    orderId = data!.id;
    await admin.from("errand_order_tracking").upsert({ order_id: orderId, lat: 33.87, lng: 35.51 });
  });
  afterAll(cleanupUsers);

  const view = async (who: "seeker" | "provider" | "admin", userId: string) => {
    const { data: o } = await admin.from("errand_orders").select("*").eq("id", orderId).single();
    return orderView(admin, o!, who, userId);
  };

  it("the customer sees where the rider is", async () => {
    const v = await view("seeker", customer.id);
    expect(v.riderAt).toMatchObject({ lat: 33.87, lng: 35.51 });
  });

  it("nobody else does (the rider's own view, another provider)", async () => {
    expect((await view("provider", rider.id)).riderAt).toBeNull();
    expect((await view("provider", stranger.id)).riderAt).toBeNull();
  });

  it("users can't read the table directly", async () => {
    const { data } = await customer.client.from("errand_order_tracking").select("*");
    expect(data ?? []).toEqual([]);
  });

  it("an old position isn't shown", async () => {
    await admin.from("errand_order_tracking").update({ located_at: new Date(Date.now() - 10 * 60_000).toISOString() }).eq("order_id", orderId);
    expect((await view("seeker", customer.id)).riderAt).toBeNull();
  });

  it("delivered: the position is deleted", async () => {
    await admin.from("errand_order_tracking").upsert({ order_id: orderId, lat: 33.86, lng: 35.52, located_at: new Date().toISOString() });
    await admin.from("errand_orders").update({ status: "delivered" }).eq("id", orderId);
    const { data } = await admin.from("errand_order_tracking").select("order_id").eq("order_id", orderId);
    expect(data).toEqual([]);
  });
});
