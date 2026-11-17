/**
 * The STUN/TURN servers a call's two phones use to find a path to each
 * other (WebRTC). STUN alone is enough on most home Wi-Fi, but mobile
 * networks often put people behind NATs that need a TURN relay, so calls
 * there only connect once a TURN service is configured:
 *
 *   CLOUDFLARE_TURN_KEY_ID      Cloudflare dashboard → Realtime → TURN Server
 *   CLOUDFLARE_TURN_API_TOKEN   → create a TURN key; short-lived credentials
 *                               are minted per call from these.
 *
 * or any other TURN service with fixed credentials:
 *
 *   TURN_URLS        comma-separated, e.g. "turn:turn.example.com:3478,turns:turn.example.com:5349"
 *   TURN_USERNAME
 *   TURN_CREDENTIAL
 */

export type IceServer = { urls: string | string[]; username?: string; credential?: string };

const STUN: IceServer = { urls: ["stun:stun.cloudflare.com:3478", "stun:stun.l.google.com:19302"] };

export function turnConfigured() {
  return (
    (!!process.env.CLOUDFLARE_TURN_KEY_ID && !!process.env.CLOUDFLARE_TURN_API_TOKEN) ||
    (!!process.env.TURN_URLS && !!process.env.TURN_USERNAME && !!process.env.TURN_CREDENTIAL)
  );
}

async function cloudflareTurn(): Promise<IceServer[]> {
  const keyId = process.env.CLOUDFLARE_TURN_KEY_ID;
  const token = process.env.CLOUDFLARE_TURN_API_TOKEN;
  if (!keyId || !token) return [];
  try {
    const res = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate-ice-servers`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      // Long enough for any call; credentials are minted per call.
      body: JSON.stringify({ ttl: 4 * 60 * 60 }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.error("[ice-servers] cloudflare turn:", res.status, await res.text().catch(() => ""));
      return [];
    }
    const body = (await res.json()) as { iceServers?: IceServer | IceServer[] };
    const servers = Array.isArray(body.iceServers) ? body.iceServers : body.iceServers ? [body.iceServers] : [];
    // Port 53 URLs are blocked by some browsers and slow down gathering.
    return servers
      .map((s) => ({ ...s, urls: (Array.isArray(s.urls) ? s.urls : [s.urls]).filter((u) => !/:53(\?|$)/.test(u)) }))
      .filter((s) => s.urls.length > 0);
  } catch (err) {
    console.error("[ice-servers] cloudflare turn:", err);
    return [];
  }
}

function staticTurn(): IceServer[] {
  const urls = process.env.TURN_URLS?.split(",").map((u) => u.trim()).filter(Boolean);
  if (!urls?.length || !process.env.TURN_USERNAME || !process.env.TURN_CREDENTIAL) return [];
  return [{ urls, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL }];
}

/** STUN, plus TURN when a service is configured. */
export async function iceServers(): Promise<IceServer[]> {
  const turn = [...(await cloudflareTurn()), ...staticTurn()];
  return [STUN, ...turn];
}
