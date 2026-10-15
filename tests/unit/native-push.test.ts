import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sendFcm } from "@/lib/native-push";

// FCM's OAuth step is the part most likely to break silently in production:
// check the service-account JWT is signed with the account's key and asks
// for the messaging scope, and that a dead token is reported as gone.

const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const account = {
  project_id: "ouiknow-test",
  client_email: "push@ouiknow-test.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendFcm", () => {
  it("signs in as the service account and reports dead tokens as gone", async () => {
    vi.stubEnv("FCM_SERVICE_ACCOUNT", JSON.stringify(account));
    const calls: { url: string; body: string; auth?: string }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      const body = String(init.body);
      calls.push({ url, body, auth: (init.headers as Record<string, string>).Authorization });
      if (url.includes("oauth2")) return Response.json({ access_token: "access", expires_in: 3600 });
      return body.includes("dead-token")
        ? new Response('{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}', { status: 404 })
        : Response.json({ name: "ok" });
    });

    const results = await sendFcm(["live-token", "dead-token"], { title: "ouiKnow", body: "Hi", url: "/en/messages" });
    expect(results).toEqual(["sent", "gone"]);

    const assertion = new URLSearchParams(calls[0].body).get("assertion")!;
    const [header, claims, signature] = assertion.split(".");
    const ok = verify("sha256", Buffer.from(`${header}.${claims}`), publicKey, Buffer.from(signature, "base64url"));
    expect(ok).toBe(true);
    const decoded = JSON.parse(Buffer.from(claims, "base64url").toString());
    expect(decoded.iss).toBe(account.client_email);
    expect(decoded.scope).toBe("https://www.googleapis.com/auth/firebase.messaging");

    const send = calls.find((c) => c.url.includes("messages:send"))!;
    expect(send.url).toContain("/projects/ouiknow-test/");
    expect(send.auth).toBe("Bearer access");
    expect(JSON.parse(send.body).message.data.url).toBe("/en/messages");
  });
});
