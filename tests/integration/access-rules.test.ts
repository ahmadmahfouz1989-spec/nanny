import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";
import {
  admin,
  categoryId,
  cleanupUsers,
  createProfile,
  createUser,
  governorateId,
  matchBetween,
  NANNY_PROVIDER,
  NANNY_SEEKER,
  type TestUser,
} from "./helpers";

// Rules the database itself enforces, checked through a real signed-in
// client -- the same way the app's own requests reach Supabase.

afterAll(cleanupUsers);

describe("profile moderation and visibility", () => {
  let owner: TestUser;
  let viewer: TestUser;
  let pendingId: string;

  beforeAll(async () => {
    [owner, viewer] = await Promise.all([createUser("owner"), createUser("viewer")]);
    pendingId = await createProfile(owner, "nanny", "provider", NANNY_PROVIDER, { approved: false });
  });

  it("an owner can't approve their own profile", async () => {
    const { error } = await owner.client.from("generic_profiles").update({ moderation_status: "approved" }).eq("id", pendingId);
    expect(error).not.toBeNull();
    const { data } = await admin.from("generic_profiles").select("moderation_status").eq("id", pendingId).single();
    expect(data!.moderation_status).toBe("pending");
  });

  it("a profile in review is visible to its owner only", async () => {
    const { data: own } = await owner.client.from("generic_profiles").select("id").eq("id", pendingId);
    expect(own).toHaveLength(1);
    const { data: other } = await viewer.client.from("generic_profiles").select("id").eq("id", pendingId);
    expect(other).toEqual([]);
  });

  it("a user can't create a profile for someone else", async () => {
    const { error } = await viewer.client.from("generic_profiles").insert({
      user_id: owner.id,
      category_id: await categoryId("nursing"),
      role: "seeker",
      full_name: "Forged",
      location_id: await governorateId(),
      attributes: {},
      status: "draft",
    });
    expect(error).not.toBeNull();
  });

  it("a photo URL must point into the owner's own folder", async () => {
    const foreign = `http://127.0.0.1:54321/storage/v1/object/public/generic-photos/${viewer.id}/a.jpg`;
    const { error } = await owner.client.from("generic_profiles").update({ profile_photo_url: foreign }).eq("id", pendingId);
    expect(error).not.toBeNull();
    const own = `http://127.0.0.1:54321/storage/v1/object/public/generic-photos/${owner.id}/a.jpg`;
    const { error: ownError } = await owner.client.from("generic_profiles").update({ profile_photo_url: own }).eq("id", pendingId);
    expect(ownError).toBeNull();
  });
});

describe("suspension", () => {
  it("a suspended user can no longer write", async () => {
    const [p, n] = await Promise.all([createUser("susp-parent"), createUser("susp-nanny")]);
    const parentProfile = await createProfile(p, "nanny", "seeker", NANNY_SEEKER);
    const nannyProfile = await createProfile(n, "nanny", "provider", NANNY_PROVIDER);
    await recomputeGenericMatchesForProfile(nannyProfile);
    const matchId = await matchBetween(parentProfile, nannyProfile);

    const { error: before } = await p.client.from("generic_messages").insert({ match_id: matchId, sender_id: p.id, body: "hi" });
    expect(before).toBeNull();

    await admin.from("users").update({ status: "suspended" }).eq("id", p.id);
    const { error: after } = await p.client.from("generic_messages").insert({ match_id: matchId, sender_id: p.id, body: "still here?" });
    expect(after).not.toBeNull();
  });

  it("a user can't change their own role or status", async () => {
    const u = await createUser("self-promote");
    const { error: role } = await u.client.from("users").update({ role: "admin" }).eq("id", u.id);
    const { data } = await admin.from("users").select("role").eq("id", u.id).single();
    expect(role !== null || data!.role !== "admin").toBe(true);
    expect(data!.role).not.toBe("admin");
  });
});
