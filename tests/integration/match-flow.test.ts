import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";
import { resolveMatchAccess } from "@/lib/matching/match-access";
import { allConversations } from "@/lib/inbox";
import { admin, cleanupUsers, createProfile, createUser, matchBetween, NANNY_PROVIDER, NANNY_SEEKER, type TestUser } from "./helpers";

// The core loop every category shares: approval scores the pair, then
// either side can message straight away (no interest step), the two can
// rate each other once both have written -- and nobody else can see or
// touch any of it.

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

const send = (user: TestUser, id: string, body: string) =>
  user.client.from("generic_messages").insert({ match_id: id, sender_id: user.id, body });

const rate = (user: TestUser, ratee: TestUser) =>
  user.client
    .from("generic_ratings")
    .upsert({ match_id: matchId, rater_user_id: user.id, ratee_user_id: ratee.id, score: 5 }, { onConflict: "match_id,rater_user_id" });

describe("message → reply → rating", () => {
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

  it("lets either side write first, records who started it, and keeps strangers out", async () => {
    expect((await send(parent, matchId, "Hello!")).error).toBeNull();

    const { data: match } = await admin.from("generic_matches").select("started_by, last_message_at").eq("id", matchId).single();
    expect(match!.started_by).toBe(parent.id);
    expect(match!.last_message_at).not.toBeNull();

    const { data: seen } = await nanny.client.from("generic_messages").select("body").eq("match_id", matchId);
    expect(seen!.map((m) => m.body)).toEqual(["Hello!"]);

    const { data: strangerSees } = await stranger.client.from("generic_messages").select("id").eq("match_id", matchId);
    expect(strangerSees).toEqual([]);
    expect((await send(stranger, matchId, "intruder")).error).not.toBeNull();

    // Nobody can send as someone else.
    const { error: spoof } = await parent.client.from("generic_messages").insert({ match_id: matchId, sender_id: nanny.id, body: "spoof" });
    expect(spoof).not.toBeNull();
  });

  it("only allows rating once both sides have written", async () => {
    expect((await rate(parent, nanny)).error).not.toBeNull();

    expect((await send(nanny, matchId, "Hi, happy to help")).error).toBeNull();
    expect((await rate(parent, nanny)).error).toBeNull();

    const { error: selfRating } = await parent.client
      .from("generic_ratings")
      .insert({ match_id: matchId, rater_user_id: parent.id, ratee_user_id: parent.id, score: 5 });
    expect(selfRating).not.toBeNull();
  });

  it("stops all new messages once either side blocks, but keeps the history readable", async () => {
    await admin.from("generic_matches").update({ status: "declined_by_provider" }).eq("id", matchId);
    expect((await send(parent, matchId, "are you there?")).error).not.toBeNull();
    expect((await send(nanny, matchId, "one more thing")).error).not.toBeNull();

    const { data: history } = await parent.client.from("generic_messages").select("body").eq("match_id", matchId);
    expect(history!.length).toBe(2);
  });
});

describe("starting conversations", () => {
  it("can't be started with a profile that isn't approved", async () => {
    const [p, n] = await Promise.all([createUser("pending-parent"), createUser("pending-nanny")]);
    const parentProfile = await createProfile(p, "nanny", "seeker", NANNY_SEEKER);
    const nannyProfile = await createProfile(n, "nanny", "provider", NANNY_PROVIDER);
    await recomputeGenericMatchesForProfile(nannyProfile);
    const id = await matchBetween(parentProfile, nannyProfile);

    await admin.from("generic_profiles").update({ moderation_status: "pending" }).eq("id", nannyProfile);
    const { error } = await send(p, id, "Hello?");
    expect(error?.message).toContain("profile_not_available");
  });

  it("is limited to 30 new people a day, while replies stay unlimited", async () => {
    const sender = await createUser("busy-parent");
    const senderProfile = await createProfile(sender, "nanny", "seeker", NANNY_SEEKER);
    const nannies = await Promise.all(Array.from({ length: 31 }, (_, i) => createUser(`limit-nanny-${i}`)));
    const nannyProfiles = await Promise.all(nannies.map((n) => createProfile(n, "nanny", "provider", NANNY_PROVIDER)));
    await recomputeGenericMatchesForProfile(senderProfile);
    const ids = await Promise.all(nannyProfiles.map((np) => matchBetween(senderProfile, np)));

    for (const id of ids.slice(0, 30)) expect((await send(sender, id, "Hi!")).error).toBeNull();
    const { error } = await send(sender, ids[30]!, "Hi!");
    expect(error?.message).toContain("new_conversation_limit");

    // Writing again in a conversation already started doesn't count...
    expect((await send(sender, ids[0]!, "Following up")).error).toBeNull();
    // ...and neither does answering someone who wrote first.
    expect((await send(nannies[30]!, ids[30]!, "Hello, I saw your request")).error).toBeNull();
    expect((await send(sender, ids[30]!, "Thanks for reaching out")).error).toBeNull();
  });
});

describe("inbox", () => {
  it("lists conversations with messages, the one being opened, and never blocked ones", async () => {
    const [p, a, b] = await Promise.all([createUser("inbox-parent"), createUser("inbox-nanny-a"), createUser("inbox-nanny-b")]);
    const parentProfile = await createProfile(p, "nanny", "seeker", NANNY_SEEKER);
    const [aProfile, bProfile] = await Promise.all([
      createProfile(a, "nanny", "provider", NANNY_PROVIDER),
      createProfile(b, "nanny", "provider", NANNY_PROVIDER),
    ]);
    await recomputeGenericMatchesForProfile(parentProfile);
    const [withA, withB] = await Promise.all([matchBetween(parentProfile, aProfile), matchBetween(parentProfile, bProfile)]);

    const ids = async (include: string | null = null) => (await allConversations(p.client, p.id, include)).map((c) => c.matchId);
    expect(await ids()).toEqual([]);
    expect(await ids(withB)).toEqual([withB]);

    await send(a, withA, "Hello from A");
    expect(await ids()).toEqual([withA]);

    await admin.from("generic_matches").update({ status: "declined_by_seeker" }).eq("id", withA);
    expect(await ids(withA)).toEqual([]);
  });
});

describe("home maintenance", () => {
  it("scores with its own rubric, and a different trade scores 0", async () => {
    const [customer, plumber, painter] = await Promise.all([
      createUser("maint-customer"),
      createUser("maint-plumber"),
      createUser("maint-painter"),
    ]);
    const jobRequest = await createProfile(customer, "maintenance", "seeker", {
      tradesNeeded: ["plumber"],
      jobDescription: "Kitchen sink is leaking",
      urgency: "urgent",
      neededDays: [],
    });
    const worker = { availability: { days: ["mon"] }, takesUrgentJobs: true, yearsExperience: 6, serviceAreaIds: [] };
    const plumberProfile = await createProfile(plumber, "maintenance", "provider", { ...worker, trades: ["plumber"] });
    const painterProfile = await createProfile(painter, "maintenance", "provider", { ...worker, trades: ["painter"] });
    await recomputeGenericMatchesForProfile(jobRequest);

    const { data: good } = await admin.from("generic_matches").select("score, score_breakdown").eq("id", await matchBetween(jobRequest, plumberProfile)).single();
    expect(Object.keys(good!.score_breakdown as object).sort()).toEqual(["availability", "experience", "location", "trade"]);
    expect(Number(good!.score)).toBe(100);

    const { data: wrongTrade } = await admin.from("generic_matches").select("score").eq("id", await matchBetween(jobRequest, painterProfile)).single();
    expect(Number(wrongTrade!.score)).toBe(0);
  });
});
