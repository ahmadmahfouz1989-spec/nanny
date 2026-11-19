import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { admin, cleanupUsers, createProfile, createUser, matchBetween, NANNY_PROVIDER, NANNY_SEEKER, type TestUser } from "./helpers";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";
import { markMissedCallsSeen, sweepStaleCalls, takesCalls, unseenMissedCalls } from "@/lib/calls";

// Missed calls count until looked at; rings nobody ended become missed
// calls; people can turn calls off for everyone or one conversation.

describe("call history", () => {
  let family: TestUser, nanny: TestUser, matchId: string;
  beforeAll(async () => {
    [family, nanny] = await Promise.all([createUser("calls-family"), createUser("calls-nanny")]);
    const seeker = await createProfile(family, "nanny", "seeker", NANNY_SEEKER);
    const provider = await createProfile(nanny, "nanny", "provider", NANNY_PROVIDER);
    await recomputeGenericMatchesForProfile(seeker);
    matchId = await matchBetween(seeker, provider);
  });
  afterAll(cleanupUsers);

  const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();
  const call = async (fields: Record<string, unknown>) =>
    (
      await admin
        .from("calls")
        .insert({ match_id: matchId, caller_id: family.id, callee_id: nanny.id, ...fields })
        .select("id")
        .single()
    ).data!.id;
  const status = async (id: string) => (await admin.from("calls").select("status, ended_at").eq("id", id).single()).data!;

  it("turns a ring nobody ended into a missed call, and leaves a fresh one ringing", async () => {
    const stale = await call({ created_at: ago(120) });
    const fresh = await call({});
    await sweepStaleCalls(admin);
    expect((await status(stale)).status).toBe("missed");
    expect((await status(stale)).ended_at).not.toBeNull();
    expect((await status(fresh)).status).toBe("ringing");
    await admin.from("calls").update({ status: "ended" }).eq("id", fresh);
  });

  it("counts missed calls until the person called looks at them", async () => {
    await admin.from("calls").update({ seen_at: new Date().toISOString() }).eq("callee_id", nanny.id);
    await call({ status: "missed", ended_at: ago(5) });
    await call({ status: "busy", ended_at: ago(4) });
    await call({ status: "declined", ended_at: ago(3) });
    expect(await unseenMissedCalls(admin, nanny.id)).toBe(2);
    // The caller has nothing missed.
    expect(await unseenMissedCalls(admin, family.id)).toBe(0);

    await markMissedCallsSeen(admin, nanny.id, matchId);
    expect(await unseenMissedCalls(admin, nanny.id)).toBe(0);
  });

  it("lets people turn calls off, for everyone or in one conversation", async () => {
    expect(await takesCalls(admin, nanny.id, matchId)).toBe(true);

    await admin.from("call_mutes").insert({ user_id: nanny.id, match_id: matchId });
    expect(await takesCalls(admin, nanny.id, matchId)).toBe(false);
    // Each person sees only their own.
    expect((await nanny.client.from("call_mutes").select("match_id")).data).toHaveLength(1);
    expect((await family.client.from("call_mutes").select("match_id")).data).toHaveLength(0);
    await admin.from("call_mutes").delete().eq("user_id", nanny.id);

    await admin.from("users").update({ accepts_calls: false }).eq("id", nanny.id);
    expect(await takesCalls(admin, nanny.id, matchId)).toBe(false);
    await admin.from("users").update({ accepts_calls: true }).eq("id", nanny.id);
    expect(await takesCalls(admin, nanny.id, matchId)).toBe(true);
  });

  it("lets each side read their own calls only", async () => {
    const id = await call({ status: "ended" });
    expect((await family.client.from("calls").select("id").eq("id", id)).data).toHaveLength(1);
    expect((await nanny.client.from("calls").select("id").eq("id", id)).data).toHaveLength(1);
    const outsider = await createUser("calls-outsider");
    expect((await outsider.client.from("calls").select("id").eq("id", id)).data).toHaveLength(0);
  });
});
