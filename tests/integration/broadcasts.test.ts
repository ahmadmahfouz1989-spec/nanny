import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { admin, categoryId, cleanupUsers, createProfile, createUser, type TestUser } from "./helpers";

// Real database, pretend Apple: everything up to the network call is real.
const apns = vi.hoisted(() => ({ results: new Map<string, "sent" | "gone" | "failed">(), calls: [] as { tokens: string[]; message: { title: string; body: string; url: string; tag?: string } }[] }));
vi.mock("@/lib/native-push", () => ({
  apnsEnabled: () => true,
  fcmEnabled: () => false,
  sendFcm: async (tokens: string[]) => tokens.map(() => "failed"),
  sendApns: async (tokens: string[], message: { title: string; body: string; url: string; tag?: string }) => {
    apns.calls.push({ tokens, message });
    return tokens.map((t) => apns.results.get(t) ?? "sent");
  },
}));

import { createBroadcast, deliverBroadcast, queueRetry, resolveRecipients } from "@/lib/broadcast";
import { sendPushCounted } from "@/lib/push";

const addToken = async (user: TestUser) => {
  const token = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");
  const { error } = await admin.from("native_push_tokens").insert({ user_id: user.id, token, platform: "ios", locale: "en" });
  if (error) throw error;
  return token;
};
const rows = async (id: string) => (await admin.from("broadcast_recipients").select("user_id, push_status, devices_sent, devices_failed, read_at").eq("broadcast_id", id)).data!;
const rowOf = async (id: string, user: TestUser) => (await rows(id)).find((r) => r.user_id === user.id);
const send = (createdBy: string, userIds: string[], over: Partial<{ title: string; body: string; requestId: string }> = {}) =>
  createBroadcast(admin, { requestId: randomUUID(), createdBy, title: "Road closure", body: "Hamra is closed tomorrow.", target: { audience: "selected", userIds }, ...over });

describe("broadcast messages", () => {
  let boss: TestUser, tutor: TestUser, both: TestUser, parent: TestUser, inReview: TestUser, banned: TestUser;
  let tutoring: string;

  beforeAll(async () => {
    [boss, tutor, both, parent, inReview, banned] = await Promise.all(["boss", "tutor", "both", "parent", "review", "banned"].map((t) => createUser(`bc-${t}`)));
    tutoring = await categoryId("tutoring");
    await createProfile(tutor, "tutoring", "provider", {});
    await createProfile(both, "tutoring", "provider", {});
    await createProfile(both, "nursing", "provider", {});
    await createProfile(parent, "tutoring", "seeker", {});
    await createProfile(inReview, "tutoring", "provider", {}, { approved: false });
    await createProfile(banned, "tutoring", "provider", {});
    await admin.from("users").update({ status: "suspended" }).eq("id", banned.id);
  });
  afterAll(async () => {
    await cleanupUsers();
    // Their sender is gone with the test users, so these are this file's own.
    await admin.from("broadcasts").delete().is("created_by", null);
  });
  beforeEach(() => {
    apns.calls.length = 0;
    apns.results.clear();
  });

  describe("who it reaches", () => {
    it("a category: approved providers there, once each, nobody else", async () => {
      const list = await resolveRecipients(admin, { audience: "category", categoryId: tutoring });
      expect(list).toEqual(expect.arrayContaining([tutor.id, both.id]));
      expect(list).not.toContain(parent.id);
      expect(list).not.toContain(inReview.id);
      expect(list).not.toContain(banned.id);
      expect(list.filter((id) => id === both.id)).toHaveLength(1);
    });

    it("all providers: someone with two provider profiles is one person", async () => {
      const list = await resolveRecipients(admin, { audience: "all_providers" });
      expect(list.filter((id) => id === both.id)).toHaveLength(1);
      expect(list).not.toContain(parent.id);
    });

    it("another category isn't reached", async () => {
      const list = await resolveRecipients(admin, { audience: "category", categoryId: await categoryId("nursing") });
      expect(list).toContain(both.id);
      expect(list).not.toContain(tutor.id);
    });

    it("selected: only real, active providers, whatever ids are sent", async () => {
      const list = await resolveRecipients(admin, { audience: "selected", userIds: [tutor.id, inReview.id, parent.id, banned.id, randomUUID()] });
      expect(list.sort()).toEqual([tutor.id, inReview.id].sort());
    });
  });

  describe("sending", () => {
    it("reaches the phone as ouiKnow, opening the message, and logs it", async () => {
      const token = await addToken(tutor);
      const { id } = await send(boss.id, [tutor.id]);
      expect((await rowOf(id, tutor))!.push_status).toBe("pending");
      await deliverBroadcast(admin, id);

      const call = apns.calls.find((c) => c.tokens.includes(token))!;
      expect(call.message.title).toBe("ouiKnow");
      expect(call.message.body).toContain("Road closure");
      expect(call.message.url).toBe(`/en/announcements/${id}`);
      expect(await rowOf(id, tutor)).toMatchObject({ push_status: "sent", devices_sent: 1, devices_failed: 0 });
      expect((await admin.from("broadcasts").select("status").eq("id", id).single()).data!.status).toBe("finished");
    });

    it("a long message is cut for the notification and kept whole in the inbox", async () => {
      const body = "word ".repeat(300).trim();
      const { id } = await send(boss.id, [tutor.id], { body });
      await deliverBroadcast(admin, id);
      const sent = apns.calls.at(-1)!.message.body;
      expect(sent.length).toBeLessThanOrEqual(178);
      expect(sent.endsWith("…")).toBe(true);
      expect((await tutor.client.from("broadcasts").select("body").eq("id", id).single()).data!.body).toBe(body);
    });

    it("pressing Send twice is one message", async () => {
      const requestId = randomUUID();
      const first = await send(boss.id, [tutor.id], { requestId });
      const second = await send(boss.id, [tutor.id], { requestId });
      expect(second).toMatchObject({ id: first.id, created: false });
      expect((await admin.from("notifications").select("id").eq("payload->>broadcast_id", first.id)).data).toHaveLength(1);
    });

    it("running the sender twice at once sends one copy", async () => {
      const lone = await createUser("bc-lone");
      await createProfile(lone, "tutoring", "provider", {});
      const token = await addToken(lone);
      const { id } = await send(boss.id, [lone.id]);
      await Promise.all([deliverBroadcast(admin, id), deliverBroadcast(admin, id)]);
      expect(apns.calls.filter((c) => c.tokens.includes(token))).toHaveLength(1);
    });

    it("no device: logged as such, and the inbox still has it", async () => {
      const quiet = await createUser("bc-quiet");
      await createProfile(quiet, "tutoring", "provider", {});
      const { id } = await send(boss.id, [quiet.id]);
      await deliverBroadcast(admin, id);
      expect((await rowOf(id, quiet))!.push_status).toBe("no_device");
      expect((await quiet.client.from("broadcast_recipients").select("broadcast_id").eq("broadcast_id", id)).data).toHaveLength(1);
    });

    it("a dead token is forgotten, and isn't a failure", async () => {
      const gone = await createUser("bc-gone");
      await createProfile(gone, "tutoring", "provider", {});
      const token = await addToken(gone);
      apns.results.set(token, "gone");
      const { id } = await send(boss.id, [gone.id]);
      await deliverBroadcast(admin, id);
      expect((await rowOf(id, gone))!.push_status).toBe("no_device");
      expect((await admin.from("native_push_tokens").select("id").eq("token", token)).data).toHaveLength(0);
    });

    it("Send again: only those no device accepted", async () => {
      const [ok, bad] = await Promise.all([createUser("bc-ok"), createUser("bc-bad")]);
      await createProfile(ok, "tutoring", "provider", {});
      await createProfile(bad, "tutoring", "provider", {});
      const okToken = await addToken(ok);
      const badToken = await addToken(bad);
      apns.results.set(badToken, "failed");
      const { id } = await send(boss.id, [ok.id, bad.id]);
      await deliverBroadcast(admin, id);
      expect((await rowOf(id, bad))).toMatchObject({ push_status: "failed", devices_failed: 1 });

      apns.calls.length = 0;
      apns.results.clear();
      expect(await queueRetry(admin, id)).toMatchObject({ waiting: 1 });
      await deliverBroadcast(admin, id);
      const tokens = apns.calls.flatMap((c) => c.tokens);
      expect(tokens).toContain(badToken);
      expect(tokens).not.toContain(okToken);
      expect((await rowOf(id, bad))!.push_status).toBe("sent");
    });

    it("one phone accepted and one failed counts as reached, and is never resent", async () => {
      const two = await createUser("bc-two");
      await createProfile(two, "tutoring", "provider", {});
      await addToken(two);
      const dead = await addToken(two);
      apns.results.set(dead, "failed");
      const { id } = await send(boss.id, [two.id]);
      await deliverBroadcast(admin, id);
      expect(await rowOf(id, two)).toMatchObject({ push_status: "sent", devices_sent: 1, devices_failed: 1 });
      expect(await queueRetry(admin, id)).toMatchObject({ waiting: 0 });
    });

    it("a send a restart cut off can be picked up, a running one can't", async () => {
      const cut = await createUser("bc-cut");
      await createProfile(cut, "tutoring", "provider", {});
      const { id } = await send(boss.id, [cut.id]);
      await admin.from("broadcast_recipients").update({ push_status: "sending", attempted_at: new Date().toISOString() }).eq("broadcast_id", id);
      expect(await queueRetry(admin, id)).toMatchObject({ waiting: 0 });
      await admin.from("broadcast_recipients").update({ attempted_at: new Date(Date.now() - 10 * 60 * 1000).toISOString() }).eq("broadcast_id", id);
      expect(await queueRetry(admin, id)).toMatchObject({ waiting: 1 });
    });

    it("no recipients: nothing is saved", async () => {
      const saved = await send(boss.id, [parent.id]);
      expect(saved).toMatchObject({ id: "", recipients: 0 });
    });
  });

  describe("reading and access", () => {
    let id: string;
    beforeAll(async () => {
      ({ id } = await send(boss.id, [tutor.id]));
    });

    it("the bell has it, opening the message", async () => {
      const { data } = await tutor.client.from("notifications").select("type, payload").eq("payload->>broadcast_id", id).single();
      expect(data!.type).toBe("announcement");
      expect((data!.payload as { title: string }).title).toBe("Road closure");
    });

    it("clearing the bell leaves the inbox", async () => {
      await tutor.client.from("notifications").delete().eq("payload->>broadcast_id", id);
      expect((await tutor.client.from("broadcasts").select("id").eq("id", id)).data).toHaveLength(1);
    });

    it("only recipients can read it", async () => {
      expect((await both.client.from("broadcasts").select("id").eq("id", id)).data).toHaveLength(0);
      expect((await both.client.from("broadcast_recipients").select("user_id").eq("broadcast_id", id)).data).toHaveLength(0);
    });

    it("a provider can't see who sent it, or the log", async () => {
      expect((await tutor.client.from("broadcasts").select("created_by").eq("id", id)).error).not.toBeNull();
      expect((await tutor.client.from("broadcast_recipients").select("push_status").eq("broadcast_id", id)).error).not.toBeNull();
    });

    it("nobody but the server can write", async () => {
      expect((await tutor.client.from("broadcasts").insert({ request_id: randomUUID(), title: "Hi there", body: "Fake news", audience: "all_providers" })).error).not.toBeNull();
      expect((await tutor.client.from("broadcast_recipients").update({ read_at: new Date().toISOString() }).eq("broadcast_id", id)).error).not.toBeNull();
    });

    it("device tokens stay out of reach", async () => {
      expect((await tutor.client.from("native_push_tokens").select("token")).data ?? []).toHaveLength(0);
    });
  });

  it("existing sending is unchanged: counted sends clean up the same way", async () => {
    const user = await createUser("bc-counted");
    const token = await addToken(user);
    const counts = await sendPushCounted([user.id, user.id], () => ({ title: "t", body: "b", url: "/" }));
    expect(counts.get(user.id)).toEqual({ sent: 1, failed: 0 });
    expect(apns.calls.flatMap((c) => c.tokens).filter((t) => t === token)).toHaveLength(1);
  });
});
