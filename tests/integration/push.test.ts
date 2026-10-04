import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { admin, cleanupUsers, createUser, type TestUser } from "./helpers";

// notify() writes the bell notification and pushes it to every device the
// recipient subscribed, worded in each device's language; subscriptions the
// push service reports gone (410) are deleted. Only the network send is
// mocked -- the database side is real.

const sent = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  return [] as { endpoint: string; payload: { title: string; body: string; url: string; tag: string } }[];
});

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      if (sub.endpoint.includes("gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
      sent.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    },
  },
}));

const { notify, sendPush } = await import("@/lib/push");

let user: TestUser;
const endpoint = (name: string) => `https://push.example/${name}-${user.id}`;

async function subscribe(name: string, locale: "en" | "ar") {
  const { error } = await admin
    .from("push_subscriptions")
    .insert({ user_id: user.id, endpoint: endpoint(name), p256dh: "k", auth: "a", locale });
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  user = await createUser("push");
  await subscribe("phone", "ar");
  await subscribe("laptop", "en");
  await subscribe("gone", "en");
});

afterAll(async () => {
  delete process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  delete process.env.VAPID_PRIVATE_KEY;
  await cleanupUsers();
});

describe("push", () => {
  it("notify() stores the notification and pushes it in each device's language", async () => {
    await notify({ user_id: user.id, type: "post_reply", payload: { post_id: "p1", reply_id: "r1" } });

    const { data: rows } = await admin.from("notifications").select("type").eq("user_id", user.id);
    expect(rows?.map((r) => r.type)).toEqual(["post_reply"]);

    // The send runs in the background outside a request.
    await vi.waitFor(() => expect(sent.length).toBe(2));
    const phone = sent.find((s) => s.endpoint === endpoint("phone"))!;
    const laptop = sent.find((s) => s.endpoint === endpoint("laptop"))!;
    expect(laptop.payload.body).toBe("Someone replied to your post");
    expect(laptop.payload.url).toBe("/en/feed?post=p1&reply=r1");
    expect(phone.payload.url).toBe("/ar/feed?post=p1&reply=r1");
    expect(phone.payload.body).not.toBe(laptop.payload.body);
  });

  it("forgets subscriptions the push service says are gone", async () => {
    await vi.waitFor(async () => {
      const { data } = await admin.from("push_subscriptions").select("endpoint").eq("user_id", user.id);
      expect(data?.map((d) => d.endpoint).sort()).toEqual([endpoint("laptop"), endpoint("phone")].sort());
    });
  });

  it("sendPush only reaches the given users", async () => {
    sent.length = 0;
    const other = await createUser("push-other");
    await sendPush([other.id], () => ({ title: "t", body: "b", url: "/en" }));
    expect(sent).toEqual([]);
  });
});
