import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createProfile, createUser, type TestUser } from "./helpers";
import { providerAction } from "@/lib/errand-order-actions";

// "Take the first rider": the first offer at or under the budget is
// accepted straight away; one over it waits for the customer as usual.

describe("take the first rider", () => {
  let customer: TestUser, pricey: TestUser, fair: TestUser, orderId: string;
  const recipient: Record<string, string> = {};
  beforeAll(async () => {
    [customer, pricey, fair] = await Promise.all([createUser("auto-customer"), createUser("auto-pricey"), createUser("auto-fair")]);
    const seeker = await createProfile(customer, "errands", "seeker", { errandService: "delivery" });
    const { data: district } = await admin.from("locations").select("id").eq("level", "district").limit(1).single();
    const { data } = await admin
      .from("errand_orders")
      .insert({
        seeker_user_id: customer.id, seeker_profile_id: seeker, service: "delivery", description: "A parcel", pickup_district_id: district!.id,
        timing: "asap", status: "open", budget_usd: 10, auto_accept: true, wave: 1, wave_until: new Date(Date.now() + 600_000).toISOString(),
        open_until: new Date(Date.now() + 3600_000).toISOString(),
      })
      .select("id")
      .single();
    orderId = data!.id;
    let rank = 1;
    for (const rider of [pricey, fair]) {
      const profile = await createProfile(rider, "errands", "provider", { errandServices: ["delivery"] });
      const { data: r } = await admin
        .from("errand_order_recipients")
        .insert({ order_id: orderId, provider_profile_id: profile, provider_user_id: rider.id, status: "sent", rank: rank++, sent_at: new Date().toISOString() })
        .select("id")
        .single();
      recipient[rider.id] = r!.id;
    }
  });
  afterAll(cleanupUsers);

  const order = async () => (await admin.from("errand_orders").select("*").eq("id", orderId).single()).data!;
  const offer = async (rider: TestUser, priceUsd: number) =>
    providerAction(admin, await order(), { userId: rider.id, role: "provider" }, "offer", { priceUsd, etaMinutes: 15 });

  it("an offer over the budget waits for the customer", async () => {
    expect((await offer(pricey, 14)).ok).toBe(true);
    expect((await order()).status).toBe("open");
  });

  it("the first one within it is accepted, with the chat opened", async () => {
    expect((await offer(fair, 9)).ok).toBe(true);
    const o = await order();
    expect(o.status).toBe("accepted");
    expect(o.provider_user_id).toBe(fair.id);
    expect(o.generic_match_id).not.toBeNull();
    const { data: rows } = await admin.from("errand_order_recipients").select("id, status").eq("order_id", orderId);
    expect(rows!.find((r) => r.id === recipient[pricey.id])?.status).toBe("not_selected");
  });
});
