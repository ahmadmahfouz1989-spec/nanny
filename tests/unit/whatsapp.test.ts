import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Webhook } from "standardwebhooks";
import { internationalNumber } from "@/lib/phone";
import { codeMessage } from "@/lib/whatsapp";

const SECRET = "v1,whsec_" + Buffer.from("test-secret-for-the-sms-hook-123").toString("base64");

describe("WhatsApp numbers", () => {
  it("turns what people type into a full international number", () => {
    expect(internationalNumber("961", "03 123 456")).toBe("9613123456");
    expect(internationalNumber("961", "71-234-567")).toBe("96171234567");
    expect(internationalNumber("971", "050 123 4567")).toBe("971501234567");
    expect(internationalNumber("961", "12")).toBeNull();
    expect(internationalNumber("961", "")).toBeNull();
  });

  it("doesn't add the country code twice when people type it themselves", () => {
    for (const typed of ["961 3 123 456", "+961 3 123 456", "00961 3 123 456", "+961 03 123 456", "961 71 234 567"]) {
      expect(internationalNumber("961", typed), typed).toMatch(/^961(3123456|71234567)$/);
    }
    // A full number with + wins over whatever country is selected.
    expect(internationalNumber("961", "+971 50 123 4567")).toBe("971501234567");
    expect(internationalNumber("961", "00971 50 123 4567")).toBe("971501234567");
  });

  it("keeps a short local number that only looks like it starts with the code", () => {
    // Jbeil landline 09 612 345 -> 9612345: seven digits, not +961 + 2345.
    expect(internationalNumber("961", "09 612 345")).toBe("9619612345");
    expect(internationalNumber("961", "9612345")).toBe("9619612345");
  });
});

describe("WhatsApp code message", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fills the authentication template's body and Copy code button", () => {
    vi.stubEnv("WHATSAPP_TEMPLATE_NAME", "signup_code");
    const msg = codeMessage("+961 3 123 456", "482913");
    expect(msg.to).toBe("9613123456");
    expect(msg.template.name).toBe("signup_code");
    expect(msg.template.components).toEqual([
      { type: "body", parameters: [{ type: "text", text: "482913" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "482913" }] },
    ]);
  });

  it("leaves the button out for a template without one", () => {
    vi.stubEnv("WHATSAPP_TEMPLATE_HAS_BUTTON", "false");
    expect(codeMessage("9613123456", "482913").template.components).toHaveLength(1);
  });
});

describe("Send SMS hook route", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SUPABASE_SMS_HOOK_SECRET", SECRET);
    vi.stubEnv("WHATSAPP_ACCESS_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1448288755024441");
    fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  function signed(body: object) {
    const payload = JSON.stringify(body);
    const id = "msg_1";
    const timestamp = new Date();
    const signature = new Webhook(SECRET.replace("v1,whsec_", "")).sign(id, timestamp, payload);
    return new Request("http://localhost/api/auth/sms-hook", {
      method: "POST",
      headers: { "webhook-id": id, "webhook-timestamp": String(Math.floor(timestamp.getTime() / 1000)), "webhook-signature": signature },
      body: payload,
    });
  }

  it("rejects a request Supabase didn't sign", async () => {
    const { POST } = await import("@/app/api/auth/sms-hook/route");
    const res = await POST(new Request("http://localhost/api/auth/sms-hook", { method: "POST", body: "{}" }));
    expect(res.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends the code to the user's number through Meta", async () => {
    const { POST } = await import("@/app/api/auth/sms-hook/route");
    const res = await POST(signed({ user: { phone: "9613123456" }, sms: { otp: "482913" } }));
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toContain("/1448288755024441/messages");
    expect(init.headers.Authorization).toBe("Bearer test-token");
    expect(JSON.parse(init.body).to).toBe("9613123456");
  });

  it("reports a Meta failure back to Supabase without exposing the code", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ error: { message: "Template not found" } }), { status: 404 }));
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/api/auth/sms-hook/route");
    const res = await POST(signed({ user: { phone: "9613123456" }, sms: { otp: "482913" } }));
    expect(res.status).toBe(500);
    expect(JSON.stringify(errors.mock.calls)).not.toContain("482913");
    expect(JSON.stringify(errors.mock.calls)).toContain("Template not found");
  });
});
