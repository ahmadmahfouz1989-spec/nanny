import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";
import { resolveMatchAccess } from "@/lib/matching/match-access";
import { applyInterest } from "@/lib/matching/apply-interest";
import { admin, cleanupUsers, createProfile, createUser, matchBetween, NANNY_PROVIDER, NANNY_SEEKER, request, type TestUser } from "./helpers";

// The core loop every category shares: approval scores the pair, interest
// from both sides makes it mutual, then the two can chat and rate -- and
// nobody else can see or touch any of it.

let parent: TestUser;
let nanny: TestUser;
let stranger: TestUser;
let matchId: string;

beforeAll(async () => {
  [parent, nanny, stranger] = await Promise.all([createUser("parent"), createUser("nanny"), createUser("stranger")]);
  const parentProfile = await createProfile(parent, "nanny", "seeker", NANNY_SEEKER);
  const nannyProfile = await createProfile(nanny, "nanny", "provider", NANNY_PROVIDER);
  await recomputeGenericMatchesForProfile(nannyProfile);
  matchId = await matchBetween(parentProfile, nannyProfile);
});

afterAll(cleanupUsers);

describe("interest → mutual → chat → rating", () => {
  it("scores the pair with nanny's rubric", async () => {
    const { data } = await admin.from("generic_matches").select("score, score_breakdown, status").eq("id", matchId).single();
    expect(data!.status).toBe("suggested");
    expect(Object.keys(data!.score_breakdown as object)).toContain("childAgeExperience");
    expect(Number(data!.score)).toBe(100);
  });

  it("resolves each party's side, and nobody else's", async () => {
    expect((await resolveMatchAccess(parent.client, matchId, parent.id))?.side).toBe("seeker");
    expect((await resolveMatchAccess(nanny.client, matchId, nanny.id))?.side).toBe("provider");
    expect(await resolveMatchAccess(stranger.client, matchId, stranger.id)).toBeNull();
  });

  it("locks chat until the match is mutual", async () => {
    const { error } = await parent.client.from("generic_messages").insert({ match_id: matchId, sender_id: parent.id, body: "too early" });
    expect(error).not.toBeNull();
  });

  it("goes mutual once both sides express interest, notifying both", async () => {
    const first = await applyInterest(request(), (await resolveMatchAccess(parent.client, matchId, parent.id))!);
    expect(first.status).toBe(200);
    expect((await first.json()).match.status).toBe("seeker_interested");

    const again = await applyInterest(request(), (await resolveMatchAccess(parent.client, matchId, parent.id))!);
    expect(again.status).toBe(409);

    const accept = await applyInterest(request(), (await resolveMatchAccess(nanny.client, matchId, nanny.id))!);
    expect((await accept.json()).match.status).toBe("mutual");

    const { data: notes } = await admin
      .from("notifications")
      .select("user_id, type")
      .in("user_id", [parent.id, nanny.id])
      .eq("payload->>generic_match_id", matchId);
    expect(notes!.filter((n) => n.type === "interest_accepted").map((n) => n.user_id).sort()).toEqual([parent.id, nanny.id].sort());
  });

  it("lets the two parties chat, and only them", async () => {
    const { error } = await parent.client.from("generic_messages").insert({ match_id: matchId, sender_id: parent.id, body: "Hello!" });
    expect(error).toBeNull();

    const { data: seen } = await nanny.client.from("generic_messages").select("body").eq("match_id", matchId);
    expect(seen!.map((m) => m.body)).toEqual(["Hello!"]);

    const { data: strangerSees } = await stranger.client.from("generic_messages").select("id").eq("match_id", matchId);
    expect(strangerSees).toEqual([]);
    const { error: strangerWrites } = await stranger.client
      .from("generic_messages")
      .insert({ match_id: matchId, sender_id: stranger.id, body: "intruder" });
    expect(strangerWrites).not.toBeNull();

    // Nobody can send as someone else.
    const { error: spoof } = await parent.client.from("generic_messages").insert({ match_id: matchId, sender_id: nanny.id, body: "spoof" });
    expect(spoof).not.toBeNull();
  });

  it("lets each side rate the other once", async () => {
    const { error } = await parent.client
      .from("generic_ratings")
      .upsert({ match_id: matchId, rater_user_id: parent.id, ratee_user_id: nanny.id, score: 5 }, { onConflict: "match_id,rater_user_id" });
    expect(error).toBeNull();
    const { error: selfRating } = await parent.client
      .from("generic_ratings")
      .insert({ match_id: matchId, rater_user_id: parent.id, ratee_user_id: parent.id, score: 5 });
    expect(selfRating).not.toBeNull();
  });
});

describe("race guard", () => {
  it("never lets two stale interests both win", async () => {
    const [p, n] = await Promise.all([createUser("race-parent"), createUser("race-nanny")]);
    const parentProfile = await createProfile(p, "nanny", "seeker", NANNY_SEEKER);
    const nannyProfile = await createProfile(n, "nanny", "provider", NANNY_PROVIDER);
    await recomputeGenericMatchesForProfile(nannyProfile);
    const id = await matchBetween(parentProfile, nannyProfile);

    // Both read "suggested" before either writes.
    const [accessP, accessN] = await Promise.all([resolveMatchAccess(p.client, id, p.id), resolveMatchAccess(n.client, id, n.id)]);
    const results = await Promise.all([applyInterest(request(), accessP!), applyInterest(request(), accessN!)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });
});
