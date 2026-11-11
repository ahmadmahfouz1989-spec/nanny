import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { claimReferral, referralCode, wallet } from "@/lib/points";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";
import { admin, cleanupUsers, createProfile, createUser, matchBetween, type TestUser } from "./helpers";

vi.mock("@/lib/categories", async () => {
  const { admin: db } = await import("./helpers");
  return {
    getCategories: async () => (await db.from("categories").select("id, slug, name_en, name_ar, tagline_en, tagline_ar, icon, status, href, sort_order")).data ?? [],
  };
});

const release = (enabled: boolean) => admin.from("points_settings").update({ enabled }).eq("id", true);
const points = async (u: TestUser) => (await admin.from("points_ledger").select("rule_key, points, ref").eq("user_id", u.id)).data ?? [];
const rules = async (u: TestUser) => (await points(u)).map((p) => p.rule_key).sort();
const verifyPhone = (u: TestUser) => admin.from("users").update({ phone_verified_at: new Date().toISOString() }).eq("id", u.id);

async function order(customer: TestUser, rider: TestUser) {
  const cat = (await admin.from("categories").select("id").eq("slug", "errands").single()).data!.id;
  const loc = (await admin.from("locations").select("id, parent_location_id").eq("code", "LB11").single()).data!;
  const sp = await createProfile(customer, "errands", "seeker", { errandService: "delivery", districtId: loc.id });
  const pp = await createProfile(rider, "errands", "provider", { errandServices: ["delivery"], districtId: loc.id });
  const { data, error } = await admin
    .from("errand_orders")
    .insert({ seeker_user_id: customer.id, seeker_profile_id: sp, provider_user_id: rider.id, provider_profile_id: pp, service: "delivery", description: "A bag", pickup_district_id: loc.id, timing: "asap", status: "accepted", open_until: new Date(Date.now() + 3600e3).toISOString() })
    .select("id")
    .single();
  if (error) throw error;
  void cat;
  return data.id;
}

beforeAll(async () => {
  await release(true);
});
afterAll(async () => {
  await release(false);
  await cleanupUsers();
});

describe("points and invites", () => {
  it("pays nothing while Points aren't released", async () => {
    await release(false);
    const [inviter, friend] = await Promise.all([createUser("pt-off-a"), createUser("pt-off-b")]);
    expect(await claimReferral(friend.id, await referralCode(inviter.id), "link")).toBe("ok");
    await verifyPhone(friend);
    expect(await points(inviter)).toEqual([]);
    await release(true);
  });

  it("counts an invite once the new person's phone is verified, paying both, and only once", async () => {
    const [inviter, friend, other] = await Promise.all([createUser("pt-a"), createUser("pt-b"), createUser("pt-c")]);
    const code = await referralCode(inviter.id);
    expect(code).toMatch(/^[A-Z0-9]{6}$/);
    expect(await referralCode(inviter.id)).toBe(code);

    expect(await claimReferral(inviter.id, code, "code")).toBe("own");
    expect(await claimReferral(friend.id, "NOPE99", "code")).toBe("invalid");
    expect(await claimReferral(friend.id, code, "link")).toBe("ok");
    expect(await claimReferral(friend.id, await referralCode(other.id), "link")).toBe("already");
    // Two people inviting each other is one person with two accounts.
    expect(await claimReferral(inviter.id, await referralCode(friend.id), "code")).toBe("invalid");

    expect(await rules(inviter)).toEqual([]); // not verified yet
    await verifyPhone(friend);
    expect(await rules(inviter)).toEqual(["referral_signup"]);
    expect(await rules(friend)).toEqual(["referral_welcome"]);
    await admin.from("users").update({ phone_verified_at: null }).eq("id", friend.id);
    await verifyPhone(friend);
    expect(await rules(inviter)).toEqual(["referral_signup"]);

    const w = await wallet(inviter.id);
    expect(w.balance).toBe(50);
    expect(w.fromReferrals).toBe(50);
    expect(w.invited).toHaveLength(1);
    expect(w.invited[0]!.status).toBe("counted");
  });

  it("only takes invites in an account's first days", async () => {
    const [inviter, old] = await Promise.all([createUser("pt-d"), createUser("pt-e")]);
    await admin.from("users").update({ created_at: new Date(Date.now() - 10 * 86_400_000).toISOString() }).eq("id", old.id);
    expect(await claimReferral(old.id, await referralCode(inviter.id), "code")).toBe("too_late");
  });

  it("pays for a request and a completed order, the inviter's bonuses once, and never twice for the same thing", async () => {
    const [inviter, customer, rider] = await Promise.all([createUser("pt-f"), createUser("pt-g"), createUser("pt-h")]);
    await claimReferral(customer.id, await referralCode(inviter.id), "link");
    await verifyPhone(customer);
    const id = await order(customer, rider);
    expect(await rules(customer)).toContain("request_placed");
    expect(await rules(inviter)).toEqual(["referral_first_request", "referral_signup"]);

    await admin.from("errand_orders").update({ status: "completed" }).eq("id", id);
    await admin.from("errand_orders").update({ status: "delivered" }).eq("id", id);
    await admin.from("errand_orders").update({ status: "completed" }).eq("id", id);
    expect((await rules(customer)).filter((r) => r === "service_completed")).toHaveLength(1);
    expect(await rules(rider)).toContain("job_completed");
    expect(await rules(inviter)).toEqual(["referral_first_completed", "referral_first_request", "referral_signup"]);
  });

  it("respects a rule's daily limit and its on/off switch", async () => {
    const u = await createUser("pt-i");
    const loc = (await admin.from("locations").select("id").eq("code", "LB11").single()).data!.id;
    for (const slug of ["nanny", "tutoring", "nursing", "cleaning"]) await createProfile(u, slug, "seeker", { districtId: loc });
    expect((await rules(u)).filter((r) => r === "request_placed")).toHaveLength(3);

    await admin.from("points_rules").update({ enabled: false }).eq("key", "profile_complete");
    await admin.from("users").update({ full_name: "Off Rule", contact_phone: "+961 3 111 222", nationality: "lebanese" }).eq("id", u.id);
    expect(await rules(u)).not.toContain("profile_complete");
    await admin.from("points_rules").update({ enabled: true }).eq("key", "profile_complete");
    await admin.from("users").update({ full_name: "On Rule" }).eq("id", u.id);
    expect((await rules(u)).filter((r) => r === "profile_complete")).toHaveLength(1);
  });

  it("pays for a review only after a completed order between the two", async () => {
    const [customer, nanny] = await Promise.all([createUser("pt-j"), createUser("pt-k")]);
    const seeker = await createProfile(customer, "nanny", "seeker", {});
    const provider = await createProfile(nanny, "nanny", "provider", {});
    await recomputeGenericMatchesForProfile(seeker);
    const match = await matchBetween(seeker, provider);
    await admin.from("generic_ratings").insert({ match_id: match, rater_user_id: customer.id, ratee_user_id: nanny.id, score: 5 });
    expect(await rules(customer)).not.toContain("review_written");
    expect(await rules(nanny)).not.toContain("review_received");
  });

  it("keeps admin adjustments with their reason", async () => {
    const u = await createUser("pt-l");
    const { error: noReason } = await admin.from("points_ledger").insert({ user_id: u.id, points: 25, kind: "admin" });
    expect(noReason).not.toBeNull();
    const { error } = await admin.from("points_ledger").insert({ user_id: u.id, points: -10, kind: "admin", note: "Fake activity removed" });
    expect(error).toBeNull();
    expect((await wallet(u.id)).balance).toBe(-10);
  });
});
