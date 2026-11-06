import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";

const SECRET = "v1,whsec_" + Buffer.from("test-secret-for-the-email-hook12").toString("base64");
const sendEmail = vi.fn(async () => true);

vi.mock("@/lib/email", async (original) => ({ ...(await original<typeof import("@/lib/email")>()), sendEmail }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { preferred_language: "en" } }) }) }) }),
  }),
}));

function signed(body: object) {
  const payload = JSON.stringify(body);
  const id = "msg_1";
  const at = new Date();
  const signature = new Webhook(SECRET.replace("v1,whsec_", "")).sign(id, at, payload);
  return new Request("http://localhost/api/auth/email-hook", {
    method: "POST",
    body: payload,
    headers: { "webhook-id": id, "webhook-timestamp": String(Math.floor(at.getTime() / 1000)), "webhook-signature": signature },
  });
}

const emailData = (type: string) => ({ token: "482913", token_hash: "hash123", redirect_to: "", email_action_type: type });

describe("email hook", () => {
  beforeEach(() => {
    vi.resetModules();
    sendEmail.mockClear();
    vi.stubEnv("SUPABASE_AUTH_HOOK_SECRET", SECRET);
  });
  afterEach(() => vi.unstubAllEnvs());

  const post = async (body: object) => (await import("@/app/api/auth/email-hook/route")).POST(signed(body));

  it("sends a WhatsApp account's new email to the new address, with the code and a link back to Settings", async () => {
    const res = await post({ user: { id: "u1", email: "", new_email: "maya@example.com" }, email_data: emailData("email_change") });
    expect(res.status).toBe(200);
    const [to, subject, html] = sendEmail.mock.calls[0] as unknown as [string, string, string];
    expect(to).toBe("maya@example.com");
    expect(subject).toContain("482913");
    expect(html).toContain("type=email_change");
    expect(html).toContain(encodeURIComponent("/settings"));
  });

  it("refuses when there's no address at all, rather than pretending it sent", async () => {
    const res = await post({ user: { id: "u1", email: "" }, email_data: emailData("email_change") });
    expect(res.status).toBe(400);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("still sends sign-up and recovery emails to the account's own address", async () => {
    await post({ user: { id: "u1", email: "maya@example.com" }, email_data: emailData("signup") });
    await post({ user: { id: "u1", email: "maya@example.com" }, email_data: emailData("recovery") });
    const calls = sendEmail.mock.calls as unknown as [string, string, string][];
    expect(calls.map((c) => c[0])).toEqual(["maya@example.com", "maya@example.com"]);
    expect(calls[0][2]).toContain(encodeURIComponent("/welcome"));
    expect(calls[1][2]).toContain(encodeURIComponent("/reset-password"));
  });

  it("rejects a bad signature", async () => {
    const { POST } = await import("@/app/api/auth/email-hook/route");
    const res = await POST(new Request("http://localhost/api/auth/email-hook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
