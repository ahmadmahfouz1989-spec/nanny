import { afterEach, describe, expect, it } from "vitest";
import { alertLanguage, newMessageAlert, whatsappAlertsEnabled } from "@/lib/whatsapp";

const ENV = { ...process.env };
afterEach(() => {
  process.env = { ...ENV };
});

describe("WhatsApp new-message alert", () => {
  it("is off until the template is named", () => {
    process.env.WHATSAPP_ACCESS_TOKEN = "t";
    process.env.WHATSAPP_PHONE_NUMBER_ID = "1";
    delete process.env.WHATSAPP_ALERT_TEMPLATE;
    expect(whatsappAlertsEnabled()).toBe(false);
    process.env.WHATSAPP_ALERT_TEMPLATE = "new_message";
    expect(whatsappAlertsEnabled()).toBe(true);
  });

  it("uses Arabic only once an Arabic version is approved", () => {
    delete process.env.WHATSAPP_ALERT_LANGUAGES;
    expect(alertLanguage("ar")).toBe("en");
    process.env.WHATSAPP_ALERT_LANGUAGES = "en,ar";
    expect(alertLanguage("ar")).toBe("ar");
    expect(alertLanguage("en")).toBe("en");
    expect(alertLanguage(null)).toBe("en");
  });

  it("fills the sender's name and the chat link, cleaned the way Meta requires", () => {
    process.env.WHATSAPP_ALERT_TEMPLATE = "new_message";
    const m = newMessageAlert("+961 3 123 456", "Rana\n\tAbi    Nader", "ar/messages?match=abc", "ar");
    expect(m.to).toBe("9613123456");
    expect(m.template).toEqual({
      name: "new_message",
      language: { code: "ar" },
      components: [
        { type: "body", parameters: [{ type: "text", text: "Rana Abi   Nader" }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "ar/messages?match=abc" }] },
      ],
    });
  });
});
