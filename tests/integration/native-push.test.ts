import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { admin, cleanupUsers, createUser, type TestUser } from "./helpers";

// notify() also reaches the iOS/Android apps: one APNs/FCM send per
// platform and language, worded in each install's language; tokens Apple
// or Google report dead are deleted. Web push is off here (no VAPID keys),
// which must not stop the apps getting it. Only the network send is
// mocked -- the database side is real.

type Sent = { platform: "ios" | "android"; tokens: string[]; body: string; url: string };
const sent = vi.hoisted(() => [] as Sent[]);

vi.mock("@/lib/native-push", () => {
  const send = (platform: "ios" | "android") => async (tokens: string[], m: { body: string; url: string }) => {
    sent.push({ platform, tokens, body: m.body, url: m.url });
    return tokens.map((t) => (t.includes("dead") ? "gone" : "sent"));
  };
  return { apnsEnabled: () => true, fcmEnabled: () => true, sendApns: send("ios"), sendFcm: send("android") };
});

const { notify } = await import("@/lib/push");

let user: TestUser;
const token = (name: string) => `${name}-${user.id}`.padEnd(64, "0");

async function register(name: string, platform: "ios" | "android", locale: "en" | "ar") {
  const { error } = await admin.from("native_push_tokens").insert({ user_id: user.id, token: token(name), platform, locale });
  if (error) throw new Error(error.message);
}

beforeAll(async () => {
  user = await createUser("native-push");
  await register("iphone", "ios", "ar");
  await register("ipad", "ios", "en");
  await register("pixel", "android", "en");
  await register("dead", "android", "en");
});

afterAll(cleanupUsers);

describe("native push", () => {
  it("notify() pushes to every app install in its language", async () => {
    await notify({ user_id: user.id, type: "post_reply", payload: { post_id: "p1", reply_id: "r1" } });

    await vi.waitFor(() => expect(sent.length).toBe(3));
    const iosAr = sent.find((s) => s.platform === "ios" && s.url.startsWith("/ar"))!;
    const iosEn = sent.find((s) => s.platform === "ios" && s.url.startsWith("/en"))!;
    const android = sent.find((s) => s.platform === "android")!;
    expect(iosAr.tokens).toEqual([token("iphone")]);
    expect(iosEn.tokens).toEqual([token("ipad")]);
    expect(iosEn.body).toBe("Someone replied to your post");
    expect(iosAr.body).not.toBe(iosEn.body);
    expect(android.tokens.sort()).toEqual([token("dead"), token("pixel")].sort());
    expect(android.url).toBe("/en/feed?post=p1&reply=r1");
  });

  it("forgets tokens Apple or Google say are dead", async () => {
    await vi.waitFor(async () => {
      const { data } = await admin.from("native_push_tokens").select("token").eq("user_id", user.id);
      expect(data?.map((d) => d.token).sort()).toEqual([token("iphone"), token("ipad"), token("pixel")].sort());
    });
  });
});
