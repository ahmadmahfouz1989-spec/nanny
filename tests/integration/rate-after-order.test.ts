import { afterAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createProfile, createUser } from "./helpers";

// A finished delivery can be rated even if the two never messaged.

describe("rating after an order", () => {
  afterAll(cleanupUsers);

  async function pair(status: string) {
    const [customer, rider] = await Promise.all([createUser("rate-customer"), createUser("rate-rider")]);
    const seeker = await createProfile(customer, "errands", "seeker", { errandService: "delivery" });
    const provider = await createProfile(rider, "errands", "provider", { errandServices: ["delivery"] });
    const { data: cat } = await admin.from("categories").select("id").eq("slug", "errands").single();
    const { data: match } = await admin
      .from("generic_matches")
      .upsert({ category_id: cat!.id, seeker_profile_id: seeker, provider_profile_id: provider, score: 50, score_breakdown: {} }, { onConflict: "seeker_profile_id,provider_profile_id" })
      .select("id")
      .single();
    const { data: district } = await admin.from("locations").select("id").eq("level", "district").limit(1).single();
    await admin.from("errand_orders").insert({
      seeker_user_id: customer.id,
      seeker_profile_id: seeker,
      provider_user_id: rider.id,
      provider_profile_id: provider,
      generic_match_id: match!.id,
      service: "delivery",
      description: "A parcel",
      pickup_district_id: district!.id,
      timing: "asap",
      status,
      open_until: new Date(Date.now() + 3600_000).toISOString(),
    });
    return { customer, rider, matchId: match!.id };
  }

  it("is allowed once the order is completed", async () => {
    const { customer, rider, matchId } = await pair("completed");
    const { error } = await customer.client.from("generic_ratings").insert({ match_id: matchId, rater_user_id: customer.id, ratee_user_id: rider.id, score: 5 });
    expect(error).toBeNull();
    const back = await rider.client.from("generic_ratings").insert({ match_id: matchId, rater_user_id: rider.id, ratee_user_id: customer.id, score: 4 });
    expect(back.error).toBeNull();
  });

  it("isn't while the order is still going", async () => {
    const { customer, rider, matchId } = await pair("on_the_way");
    const { error } = await customer.client.from("generic_ratings").insert({ match_id: matchId, rater_user_id: customer.id, ratee_user_id: rider.id, score: 5 });
    expect(error).not.toBeNull();
  });
});
