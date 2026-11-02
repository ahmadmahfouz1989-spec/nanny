import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { TestUser, Db } from "./helpers";

// End to end: the real route handlers run against the local database, as
// the signed-in user, and we check who gets what -- the bell entry, the
// push to their devices (wording and link), the email, and the WhatsApp
// alert. Only the network sends (web push, email, WhatsApp) are captured
// instead of sent.

const captured = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public";
  process.env.VAPID_PRIVATE_KEY = "test-private";
  return {
    pushes: [] as { endpoint: string; payload: { title: string; body: string; url: string; tag: string } }[],
    emails: [] as { to: string; subject: string }[],
    whatsapp: [] as { to: string; template: { name?: string; language: { code: string }; components: { parameters: { text: string }[] }[] } }[],
    pending: [] as Promise<unknown>[],
    acting: { client: null as unknown },
  };
});

vi.mock("web-push", () => ({
  default: {
    setVapidDetails: () => {},
    sendNotification: async (sub: { endpoint: string }, payload: string) => {
      captured.pushes.push({ endpoint: sub.endpoint, payload: JSON.parse(payload) });
    },
  },
}));

// Route handlers read the session from cookies; here it's whoever is "acting".
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => captured.acting.client }));

// after() runs once the response is sent; collect it so the test can wait.
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: (fn: () => unknown) => void captured.pending.push(Promise.resolve().then(fn)) };
});

// WhatsApp alerts on, with the send to Meta captured.
vi.mock("@/lib/whatsapp", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/whatsapp")>();
  return {
    ...actual,
    whatsappAlertsEnabled: () => true,
    sendWhatsAppAlert: async (message: (typeof captured.whatsapp)[number]) => {
      captured.whatsapp.push(message);
      return null;
    },
  };
});

// Ad measurement needs a real request; not what's under test here.
vi.mock("@/lib/meta-capi", () => ({ reportMetaEvent: async () => {} }));

vi.mock("@/lib/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/email")>();
  return {
    ...actual,
    activityEmailsEnabled: () => true,
    sendEmail: async (to: string, subject: string) => {
      captured.emails.push({ to, subject });
      return true;
    },
  };
});

const { admin, cleanupUsers, createProfile, createUser } = await import("./helpers");
const { messagesPost, ratingPut } = await import("@/lib/matching/match-routes");
const replies = await import("@/app/api/posts/[id]/replies/route");
const like = await import("@/app/api/posts/[id]/like/route");
const moderation = await import("@/app/api/admin/profiles/[id]/moderation/route");
const orderActions = await import("@/app/api/errand-orders/[id]/[action]/route");
const { dispatchOrder } = await import("@/lib/errand-orders");

afterAll(cleanupUsers);

const as = (user: TestUser) => {
  captured.acting.client = user.client as Db;
};
const settle = async () => {
  while (captured.pending.length) await Promise.all(captured.pending.splice(0));
};
const json = (body: unknown) => new Request("http://localhost:3000/api/test", { method: "POST", body: JSON.stringify(body) });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const pushesTo = (user: TestUser) => captured.pushes.filter((p) => p.endpoint.endsWith(user.id)).map((p) => p.payload);
const emailsTo = (user: TestUser) => captured.emails.filter((e) => e.to === user.email);
async function bell(user: TestUser) {
  const { data } = await admin.from("notifications").select("type, payload").eq("user_id", user.id).order("created_at");
  return data ?? [];
}
async function subscribe(user: TestUser) {
  await admin.from("push_subscriptions").insert({ user_id: user.id, endpoint: `https://push.example/${user.id}`, p256dh: "k", auth: "a", locale: "en" });
}

let customer: TestUser;
let provider: TestUser;
let outsider: TestUser;
let customerProfile: string;
let providerProfile: string;
let matchId: string;

beforeAll(async () => {
  [customer, provider, outsider] = await Promise.all([createUser("n-customer"), createUser("n-provider"), createUser("n-outsider")]);
  const { data: beirut } = await admin.from("locations").select("id, parent_location_id").eq("code", "LB11").single();
  customerProfile = await createProfile(customer, "errands", "seeker", { errandService: "delivery", districtId: beirut!.id }, { fullName: "Rana Customer" });
  providerProfile = await createProfile(provider, "errands", "provider", { errandServices: ["delivery"], districtId: beirut!.id }, { fullName: "Karim Provider" });
  await admin.from("generic_profiles").update({ location_id: beirut!.parent_location_id, available_now: true }).eq("id", providerProfile);
  const { data: match } = await admin
    .from("generic_matches")
    .insert({ category_id: (await admin.from("categories").select("id").eq("slug", "errands").single()).data!.id, seeker_profile_id: customerProfile, provider_profile_id: providerProfile, score: 90, score_breakdown: {} })
    .select("id")
    .single();
  matchId = match!.id;
  await Promise.all([subscribe(customer), subscribe(provider), subscribe(outsider)]);
});

beforeEach(() => {
  captured.pushes.length = 0;
  captured.emails.length = 0;
  captured.whatsapp.length = 0;
});

describe("messages", () => {
  it("push the recipient on every message, email them once until they read, and never notify the sender", async () => {
    as(customer);
    expect((await messagesPost(json({ body: "Hi, can you pick up a parcel?" }), ctx(matchId))).status).toBe(201);
    expect((await messagesPost(json({ body: "It's small" }), ctx(matchId))).status).toBe(201);
    await settle();

    const pushes = pushesTo(provider);
    expect(pushes).toHaveLength(2);
    expect(pushes[0]).toMatchObject({ title: "Rana Customer", body: "Hi, can you pick up a parcel?", url: `/en/messages?match=${matchId}`, tag: `message-${matchId}` });
    expect(emailsTo(provider)).toHaveLength(1);
    expect(captured.whatsapp).toEqual([]);
    expect(pushesTo(customer)).toEqual([]);
    expect(pushesTo(outsider)).toEqual([]);
    // Messages show as an unread count, not in the bell.
    expect((await bell(provider)).filter((n) => n.type !== "errand_request")).toEqual([]);
  });

  it("reach the other side when they reply", async () => {
    as(provider);
    expect((await messagesPost(json({ body: "Sure, where?" }), ctx(matchId))).status).toBe(201);
    await settle();
    expect(pushesTo(customer)[0]).toMatchObject({ title: "Karim Provider", body: "Sure, where?" });
    expect(emailsTo(customer)).toHaveLength(1);
    expect(pushesTo(provider)).toEqual([]);
  });

  it("aren't delivered at all once the conversation is blocked", async () => {
    await admin.from("generic_matches").update({ status: "declined_by_provider" }).eq("id", matchId);
    as(customer);
    expect((await messagesPost(json({ body: "Hello?" }), ctx(matchId))).status).toBe(403);
    await settle();
    expect(pushesTo(provider)).toEqual([]);
    await admin.from("generic_matches").update({ status: "suggested" }).eq("id", matchId);
  });
});

describe("ratings", () => {
  it("tell the person rated, with the score, and open their ratings", async () => {
    as(customer);
    expect((await ratingPut(new Request("http://localhost/api", { method: "PUT", body: JSON.stringify({ score: 5 }) }), ctx(matchId))).status).toBe(200);
    await settle();
    expect((await bell(provider)).map((n) => n.type)).toContain("rating_received");
    expect(pushesTo(provider)[0]).toMatchObject({ body: "You received a 5★ rating", url: "/en/profile#ratings" });
    expect(pushesTo(customer)).toEqual([]);
  });
});

describe("a WhatsApp sign-up (phone, no email)", () => {
  it("gets phone notifications, and a WhatsApp message instead of the email", async () => {
    const phone = `9617${String(Date.now()).slice(-7)}`;
    const { data, error } = await admin.auth.admin.createUser({ phone, phone_confirm: true });
    if (error || !data.user) throw new Error(error?.message);
    const whatsappUser = { id: data.user.id, email: "", client: null as unknown as Db };
    try {
      const { data: beirut } = await admin.from("locations").select("id").eq("code", "LB11").single();
      const theirProfile = await createProfile(whatsappUser, "errands", "provider", { errandServices: ["delivery"], districtId: beirut!.id }, { fullName: "Phone Only" });
      await subscribe(whatsappUser);
      const { data: match } = await admin
        .from("generic_matches")
        .insert({ category_id: (await admin.from("categories").select("id").eq("slug", "errands").single()).data!.id, seeker_profile_id: customerProfile, provider_profile_id: theirProfile, score: 90, score_breakdown: {} })
        .select("id")
        .single();

      as(customer);
      expect((await messagesPost(json({ body: "Are you free today?" }), ctx(match!.id))).status).toBe(201);
      await settle();

      expect(pushesTo(whatsappUser)[0]).toMatchObject({ title: "Rana Customer", body: "Are you free today?" });
      expect(captured.emails).toEqual([]);
      expect(captured.whatsapp).toHaveLength(1);
      expect(captured.whatsapp[0]!.to).toBe(phone);
      expect(captured.whatsapp[0]!.template.components.map((c) => c.parameters[0]!.text)).toEqual(["Rana Customer", `en/messages?match=${match!.id}`]);

      // Like the email: one per conversation until they read it.
      expect((await messagesPost(json({ body: "Around 5?" }), ctx(match!.id))).status).toBe(201);
      await settle();
      expect(captured.whatsapp).toHaveLength(1);
    } finally {
      await admin.auth.admin.deleteUser(data.user.id);
    }
  });
});

describe("feed", () => {
  let postId: string;
  beforeAll(async () => {
    const { data } = await admin.from("posts").insert({ user_id: customer.id, kind: "looking_for", caption: "Need a delivery", posted_as_generic_profile_id: customerProfile }).select("id").single();
    postId = data!.id;
  });

  it("a reply notifies the post's author and links to the reply", async () => {
    as(provider);
    expect((await replies.POST(json({ body: "I can help" }), ctx(postId))).status).toBe(201);
    await settle();
    const push = pushesTo(customer)[0]!;
    expect(push.body).toBe("Someone replied to your post");
    expect(push.url).toMatch(new RegExp(`^/en/feed\\?post=${postId}&reply=`));
    expect(emailsTo(customer)).toHaveLength(1);
  });

  it("a like notifies the author; your own reply or like doesn't", async () => {
    as(provider);
    expect((await like.POST(json({}), ctx(postId))).ok).toBe(true);
    as(customer);
    expect((await replies.POST(json({ body: "Thanks!" }), ctx(postId))).status).toBe(201);
    await settle();
    expect(pushesTo(customer).map((p) => p.body)).toEqual(["Someone liked your post"]);
  });
});

describe("profile review", () => {
  it("tells the owner their profile was approved, naming the service", async () => {
    const moderator = await createUser("n-admin");
    await admin.from("users").update({ role: "admin" }).eq("id", moderator.id);
    const pending = await createProfile(outsider, "errands", "provider", { errandServices: ["delivery"] }, { approved: false });
    as(moderator);
    const res = await moderation.PATCH(new Request("http://localhost/api", { method: "PATCH", body: JSON.stringify({ status: "approved" }) }), ctx(pending));
    expect(res.status).toBe(200);
    await settle();
    expect(pushesTo(outsider)[0]).toMatchObject({ url: "/en/categories/errands/dashboard" });
    expect(pushesTo(outsider)[0]!.body).toMatch(/Delivery|Errands|approved/);
  });
});

describe("orders", () => {
  it("tell the provider about a new order, then the customer about the offer, each stage, and completion", async () => {
    const { data: order } = await admin
      .from("errand_orders")
      .insert({
        seeker_user_id: customer.id,
        seeker_profile_id: customerProfile,
        service: "delivery",
        description: "Parcel",
        pickup_district_id: (await admin.from("locations").select("id").eq("code", "LB11").single()).data!.id,
        timing: "asap",
        open_until: new Date(Date.now() + 3600_000).toISOString(),
      })
      .select("*")
      .single();
    await dispatchOrder(admin, { ...order!, service: "delivery" }, { userId: customer.id, role: "seeker" });
    await settle();
    expect(pushesTo(provider)[0]).toMatchObject({ body: `New order #${order!.number} near you — send your price`, url: `/en/orders/${order!.id}` });
    expect(pushesTo(outsider)).toEqual([]);

    const step = async (who: TestUser, action: string, body: unknown = {}) => {
      as(who);
      const res = await orderActions.POST(json(body), { params: Promise.resolve({ id: order!.id, action }) });
      expect(res.status, `${action}: ${await res.clone().text()}`).toBe(200);
      await settle();
    };
    captured.pushes.length = 0;
    await step(provider, "offer", { priceUsd: 4, etaMinutes: 20 });
    expect(pushesTo(customer).map((p) => p.body)).toEqual([`You have a new offer on order #${order!.number}`]);

    const { data: recipient } = await admin.from("errand_order_recipients").select("id").eq("order_id", order!.id).eq("provider_user_id", provider.id).single();
    captured.pushes.length = 0;
    await step(customer, "select", { recipientId: recipient!.id });
    expect(pushesTo(provider).map((p) => p.body)).toEqual([`You were chosen for order #${order!.number} — confirm it`]);

    captured.pushes.length = 0;
    await step(provider, "confirm");
    for (let i = 0; i < 4; i++) await step(provider, "advance");
    expect(pushesTo(customer).map((p) => p.body)).toEqual([
      `Order #${order!.number} is confirmed`,
      `Order #${order!.number}: your provider is on the way`,
      `Order #${order!.number}: your provider has arrived`,
      `Order #${order!.number}: picked up / started`,
      `Order #${order!.number}: delivered`,
    ]);
    expect(pushesTo(provider)).toEqual([]);

    captured.pushes.length = 0;
    await step(customer, "complete");
    expect(pushesTo(provider).map((p) => p.body)).toEqual([`Order #${order!.number} is complete`]);
  });
});
