import { afterAll, describe, expect, it } from "vitest";
import { recomputeGenericMatchesForProfile } from "@/lib/matching/generic-recompute";
import { admin, cleanupUsers, createProfile, createUser, matchBetween, NANNY_PROVIDER, NANNY_SEEKER } from "./helpers";

// The admin Activity page: who talks to whom and how much -- counts only.

afterAll(cleanupUsers);

describe("admin conversation activity", () => {
  it("counts each side's messages, two-way conversations, and stays admin-only", async () => {
    const [parent, nanny] = await Promise.all([createUser("act-parent"), createUser("act-nanny")]);
    const parentProfile = await createProfile(parent, "nanny", "seeker", NANNY_SEEKER, { fullName: "Activity Parent" });
    const nannyProfile = await createProfile(nanny, "nanny", "provider", NANNY_PROVIDER, { fullName: "Activity Nanny" });
    await recomputeGenericMatchesForProfile(nannyProfile);
    const matchId = await matchBetween(parentProfile, nannyProfile);

    const before = (await admin.rpc("admin_conversation_stats", { p_since: new Date(Date.now() - 86_400_000).toISOString() })).data![0]!;

    for (const [user, body] of [[parent, "Hi"], [parent, "Are you free Monday?"], [nanny, "Yes!"]] as const) {
      const { error } = await user.client.from("generic_messages").insert({ match_id: matchId, sender_id: user.id, body });
      expect(error).toBeNull();
    }

    const { data: rows } = await admin.rpc("admin_conversations", { p_category: "nanny", p_limit: 200 });
    const row = rows!.find((r) => r.match_id === matchId)!;
    expect(row).toMatchObject({ seeker_name: "Activity Parent", provider_name: "Activity Nanny", started_by_side: "seeker" });
    expect([Number(row.messages), Number(row.from_seeker), Number(row.from_provider)]).toEqual([3, 2, 1]);
    // Counts only -- no message text comes back.
    expect(JSON.stringify(row)).not.toContain("Monday");

    const after = (await admin.rpc("admin_conversation_stats", { p_since: new Date(Date.now() - 86_400_000).toISOString() })).data![0]!;
    expect(Number(after.conversations) - Number(before.conversations)).toBe(1);
    expect(Number(after.two_way) - Number(before.two_way)).toBe(1);
    expect(Number(after.messages_since) - Number(before.messages_since)).toBe(3);

    // A signed-in, non-admin user can't call either function.
    const { error: denied } = await parent.client.rpc("admin_conversations", {});
    expect(denied).not.toBeNull();
    const { error: deniedStats } = await parent.client.rpc("admin_conversation_stats", { p_since: new Date().toISOString() });
    expect(deniedStats).not.toBeNull();
  });
});
