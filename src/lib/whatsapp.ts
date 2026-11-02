// Sends one-time sign-in codes over WhatsApp through Meta's Cloud API, using
// an approved Authentication template (body "{{1}} is your verification
// code" plus a Copy code button). Configured entirely through env vars --
// see .env.local.example.

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || "v21.0";

export function whatsappConfigured() {
  return Boolean(process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);
}

/** The Cloud API request body for an authentication-template code message. */
export function codeMessage(to: string, code: string) {
  const withButton = process.env.WHATSAPP_TEMPLATE_HAS_BUTTON !== "false";
  return {
    messaging_product: "whatsapp",
    // Meta wants the full international number, digits only.
    to: to.replace(/\D/g, ""),
    type: "template",
    template: {
      name: process.env.WHATSAPP_TEMPLATE_NAME || "signup_code",
      language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en" },
      components: [
        { type: "body", parameters: [{ type: "text", text: code }] },
        // An authentication template's Copy code button is a URL button
        // under the hood and needs the code too.
        ...(withButton ? [{ type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: code }] }] : []),
      ],
    },
  };
}

/** Sends the code; resolves to an error message, or null on success. */
export async function sendWhatsAppCode(to: string, code: string): Promise<string | null> {
  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(codeMessage(to, code)),
      signal: AbortSignal.timeout(10_000),
    },
  ).catch((err: unknown) => err as Error);

  if (res instanceof Error) return `WhatsApp request failed: ${res.message}`;
  if (res.ok) return null;
  const body = await res.json().catch(() => null);
  // Meta's error shape: { error: { message, code, error_subcode, ... } }
  return `WhatsApp API ${res.status}: ${body?.error?.message ?? "unknown error"}`;
}

// ─── activity alerts ────────────────────────────────────────────────────
// People who signed up with WhatsApp have no email, so where everyone
// else gets an email ("You have a new message from Rana"), they get a
// WhatsApp message instead. It uses its own approved Utility template,
// named in WHATSAPP_ALERT_TEMPLATE (off while unset):
//   body:   "You have a new message on ouiKnow from {{1}}. Open the chat to reply."
//   button: URL "Open chat" -> https://oui-know.com/{{1}}
// with an Arabic translation under the same name when
// WHATSAPP_ALERT_LANGUAGES lists "ar".

export function whatsappAlertsEnabled() {
  return whatsappConfigured() && Boolean(process.env.WHATSAPP_ALERT_TEMPLATE);
}

/** The template language to use for someone, among the ones approved. */
export function alertLanguage(preferred: string | null | undefined): string {
  const approved = (process.env.WHATSAPP_ALERT_LANGUAGES || "en").split(",").map((l) => l.trim()).filter(Boolean);
  return preferred === "ar" && approved.includes("ar") ? "ar" : (approved[0] ?? "en");
}

// Meta refuses template values with line breaks, tabs or 4+ spaces in a row.
const templateText = (text: string, max: number) => text.replace(/[\n\r\t]+/g, " ").replace(/ {4,}/g, "   ").trim().slice(0, max) || "-";

/** The Cloud API request body for a new-message alert. `path` is appended to the button's URL. */
export function newMessageAlert(to: string, sender: string, path: string, language: string) {
  return {
    messaging_product: "whatsapp",
    to: to.replace(/\D/g, ""),
    type: "template",
    template: {
      name: process.env.WHATSAPP_ALERT_TEMPLATE,
      language: { code: language },
      components: [
        { type: "body", parameters: [{ type: "text", text: templateText(sender, 60) }] },
        { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: path.replace(/^\//, "") }] },
      ],
    },
  };
}

/** Sends a new-message alert; resolves to an error message, or null on success. */
export async function sendWhatsAppAlert(message: ReturnType<typeof newMessageAlert>): Promise<string | null> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(10_000),
  }).catch((err: unknown) => err as Error);
  if (res instanceof Error) return `WhatsApp request failed: ${res.message}`;
  if (res.ok) return null;
  const body = await res.json().catch(() => null);
  return `WhatsApp API ${res.status}: ${body?.error?.message ?? "unknown error"}`;
}
