import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { createHash, randomUUID } from "node:crypto";
import { APP_USER_AGENT_MARKER } from "@/lib/app-user-agent";
import { internationalNumber } from "@/lib/phone";
import { META_EVENTS_COOKIE, META_PIXEL_ID, type MetaParams, type QueuedMetaEvent } from "@/lib/meta-events";

// Meta's Conversions API: the same events as the Pixel, sent from the
// server, so ad blockers and Safari's tracking limits can't drop them, and
// with the person's email/phone (hashed) so Meta can tie a sign-up to the
// ad that brought it. Off until META_CAPI_TOKEN is set (Events Manager ->
// the pixel -> Settings -> Conversions API -> Generate access token).
const GRAPH_URL = `https://graph.facebook.com/v24.0/${META_PIXEL_ID}/events`;
// Events Manager -> Test events shows a code; set it here to watch
// server events arrive live. Leave unset otherwise.
const TEST_EVENT_CODE = process.env.META_CAPI_TEST_CODE;
const QUEUE_LIMIT = 5;

export type MetaUser = {
  id?: string | null;
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
};

type CookieTarget = { set(name: string, value: string, options: { path: string; maxAge: number; sameSite: "lax" }): unknown };

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

/** Meta's normalisation before hashing: trimmed lowercase email, phone as digits with country code. */
export function hashedUserData(user: MetaUser | null | undefined) {
  const data: Record<string, string[]> = {};
  if (!user) return data;
  const email = user.email?.trim().toLowerCase();
  if (email) data.em = [sha256(email)];
  // Most numbers are Lebanese and often typed locally ("03 123 456").
  const phone = user.phone ? internationalNumber("961", user.phone) : null;
  if (phone) data.ph = [sha256(phone)];
  const [first, ...rest] = (user.fullName ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (first) data.fn = [sha256(first)];
  if (rest.length) data.ln = [sha256(rest.join(" "))];
  if (user.id) data.external_id = [sha256(user.id)];
  return data;
}

/** The ad click id: the Pixel's _fbc cookie, or built from ?fbclid= when the Pixel was blocked. */
function clickId(cookie: string | undefined, sourceUrl: string | null) {
  if (cookie) return cookie;
  const fbclid = sourceUrl ? URL.parse(sourceUrl)?.searchParams.get("fbclid") : null;
  return fbclid ? `fb.1.${Date.now()}.${fbclid}` : undefined;
}

export function readQueue(raw: string | undefined): QueuedMetaEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString());
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Reports one event to Meta for the current request's visitor: through
 * the Conversions API (after the response is sent), and -- unless
 * `pixel: false` -- queued for the browser Pixel under the same event ID.
 * Requests from the iOS/Android apps are never reported (see MetaPixel).
 * Never throws.
 */
export async function reportMetaEvent(
  name: string,
  options: {
    user?: MetaUser | null;
    params?: MetaParams;
    eventId?: string;
    /** The page it happened on; defaults to the request's Referer. */
    sourceUrl?: string | null;
    pixel?: boolean;
    /** Where to queue it for the Pixel when the route returns its own response (e.g. a redirect). */
    cookieTarget?: CookieTarget;
  } = {},
) {
  try {
    const h = await headers();
    const userAgent = h.get("user-agent") ?? "";
    if (userAgent.includes(APP_USER_AGENT_MARKER)) return;

    const jar = await cookies();
    const eventId = options.eventId ?? randomUUID();
    if (options.pixel !== false) {
      const queue = [...readQueue(jar.get(META_EVENTS_COOKIE)?.value), { n: name, id: eventId, ...(options.params && { p: options.params }) }];
      (options.cookieTarget ?? jar).set(META_EVENTS_COOKIE, Buffer.from(JSON.stringify(queue.slice(-QUEUE_LIMIT))).toString("base64url"), {
        path: "/",
        maxAge: 600,
        sameSite: "lax",
      });
    }

    const token = process.env.META_CAPI_TOKEN;
    if (!token || process.env.NODE_ENV !== "production") return;

    const sourceUrl = options.sourceUrl ?? h.get("referer");
    const fbc = clickId(jar.get("_fbc")?.value, sourceUrl);
    const fbp = jar.get("_fbp")?.value;
    // Railway sets "client, proxy1, ..." -- the first hop is the visitor.
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip");
    const event = {
      event_name: name,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: "website",
      ...(sourceUrl && { event_source_url: sourceUrl }),
      user_data: {
        ...hashedUserData(options.user),
        ...(ip && { client_ip_address: ip }),
        ...(userAgent && { client_user_agent: userAgent }),
        ...(fbc && { fbc }),
        ...(fbp && { fbp }),
      },
      ...(options.params && { custom_data: options.params }),
    };

    after(async () => {
      const res = await fetch(`${GRAPH_URL}?access_token=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data: [event], ...(TEST_EVENT_CODE && { test_event_code: TEST_EVENT_CODE }) }),
      }).catch(() => null);
      if (res && !res.ok) console.error(`[meta-capi] ${name} rejected (${res.status}):`, (await res.text().catch(() => "")).slice(0, 300));
    });
  } catch (e) {
    console.error("[meta-capi] not reported:", e);
  }
}
