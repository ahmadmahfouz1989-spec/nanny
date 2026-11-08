import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createProfile, createUser, matchBetween, NANNY_PROVIDER, NANNY_SEEKER, type TestUser } from "./helpers";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";

// Ticks: a message is sent (no delivered_at), delivered once the
// recipient's app checks in, read once they open it.

describe("read receipts", () => {
  let family: TestUser, nanny: TestUser, matchId: string;
  beforeAll(async () => {
    [family, nanny] = await Promise.all([createUser("tick-family"), createUser("tick-nanny")]);
    const seeker = await createProfile(family, "nanny", "seeker", NANNY_SEEKER);
    const provider = await createProfile(nanny, "nanny", "provider", NANNY_PROVIDER);
    await recomputeGenericMatchesForProfile(seeker);
    matchId = await matchBetween(seeker, provider);
  });
  afterAll(cleanupUsers);

  const state = async (id: string) => (await admin.from("generic_messages").select("delivered_at, read_at").eq("id", id).single()).data!;

  it("sent, then delivered when their app checks in, then read", async () => {
    const { data: m } = await family.client.from("generic_messages").insert({ match_id: matchId, sender_id: family.id, body: "Hello!" }).select("id").single();
    expect(await state(m!.id)).toEqual({ delivered_at: null, read_at: null });

    // The sender's own check-in doesn't deliver their own message.
    await admin.rpc("mark_messages_delivered", { p_user: family.id });
    expect((await state(m!.id)).delivered_at).toBeNull();

    await admin.rpc("mark_messages_delivered", { p_user: nanny.id });
    const delivered = await state(m!.id);
    expect(delivered.delivered_at).not.toBeNull();
    expect(delivered.read_at).toBeNull();

    await nanny.client.from("generic_messages").update({ read_at: new Date().toISOString() }).eq("match_id", matchId).neq("sender_id", nanny.id);
    expect((await state(m!.id)).read_at).not.toBeNull();
  });

  it("reading straight away counts as delivered too", async () => {
    const { data: m } = await family.client.from("generic_messages").insert({ match_id: matchId, sender_id: family.id, body: "Are you free Monday?" }).select("id").single();
    await nanny.client.from("generic_messages").update({ read_at: new Date().toISOString() }).eq("id", m!.id);
    const s = await state(m!.id);
    expect(s.read_at).not.toBeNull();
    expect(s.delivered_at).toBe(s.read_at);
  });

  it("only the server can mark messages delivered", async () => {
    const { error } = await nanny.client.rpc("mark_messages_delivered", { p_user: nanny.id });
    expect(error).not.toBeNull();
  });
});
