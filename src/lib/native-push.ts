import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import http2 from "node:http2";

/**
 * Push to the iOS and Android apps (mobile/): APNs for iPhone, FCM for
 * Android, each called directly with Node's own crypto and http2 -- no SDKs.
 * Each side is off until its env vars are set:
 *
 *   APNS_KEY        the .p8 key's contents (Apple Developer → Keys, with APNs)
 *   APNS_KEY_ID     that key's ID
 *   APNS_TEAM_ID    the Apple Developer team ID
 *   APNS_BUNDLE_ID  optional, defaults to com.ouiknow.app
 *   APNS_SANDBOX=1  only while testing builds run from Xcode; TestFlight and
 *                   App Store builds use the production gateway (the default)
 *
 *   FCM_SERVICE_ACCOUNT  the Firebase service account JSON (Project settings
 *                        → Service accounts → Generate new private key)
 */

export type NativeMessage = { title: string; body: string; url: string; tag?: string };

/** "sent", "gone" (the app was uninstalled or the token is dead -- forget it), or "failed". */
export type SendResult = "sent" | "gone" | "failed";

const base64url = (input: Buffer | string) => Buffer.from(input).toString("base64url");

function signJwt(header: object, claims: object, key: KeyObject, alg: "ES256" | "RS256") {
  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = sign("sha256", Buffer.from(data), alg === "ES256" ? { key, dsaEncoding: "ieee-p1363" } : key);
  return `${data}.${base64url(signature)}`;
}

// -- APNs -------------------------------------------------------------------

export function apnsEnabled() {
  return !!process.env.APNS_KEY && !!process.env.APNS_KEY_ID && !!process.env.APNS_TEAM_ID;
}

// Apple accepts a provider token for up to an hour and rejects ones
// refreshed more often than every 20 minutes -- reuse it for 50.
let apnsToken: { jwt: string; at: number } | null = null;

function apnsJwt() {
  const now = Date.now();
  if (apnsToken && now - apnsToken.at < 50 * 60 * 1000) return apnsToken.jwt;
  // Env vars often carry the key's line breaks as literal "\n".
  const key = createPrivateKey(process.env.APNS_KEY!.replace(/\\n/g, "\n"));
  const jwt = signJwt(
    { alg: "ES256", kid: process.env.APNS_KEY_ID },
    { iss: process.env.APNS_TEAM_ID, iat: Math.floor(now / 1000) },
    key,
    "ES256",
  );
  apnsToken = { jwt, at: now };
  return jwt;
}

/** Sends to iPhone device tokens over one HTTP/2 connection. */
export async function sendApns(tokens: string[], message: NativeMessage): Promise<SendResult[]> {
  if (!apnsEnabled() || tokens.length === 0) return tokens.map(() => "failed");
  const host = process.env.APNS_SANDBOX === "1" ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com";
  const session = http2.connect(host);
  session.on("error", (err) => console.error("[native-push] apns connection:", err));
  const payload = JSON.stringify({
    aps: { alert: { title: message.title, body: message.body }, sound: "default" },
    url: message.url,
  });

  try {
    return await Promise.all(
      tokens.map(
        (token) =>
          new Promise<SendResult>((resolve) => {
            const headers: http2.OutgoingHttpHeaders = {
              ":method": "POST",
              ":path": `/3/device/${token}`,
              authorization: `bearer ${apnsJwt()}`,
              "apns-topic": process.env.APNS_BUNDLE_ID || "com.ouiknow.app",
              "apns-push-type": "alert",
              "apns-priority": "10",
              "apns-expiration": String(Math.floor(Date.now() / 1000) + 24 * 60 * 60),
            };
            if (message.tag) headers["apns-collapse-id"] = message.tag.slice(0, 64);
            const req = session.request(headers);
            let status = 0;
            let body = "";
            req.on("response", (h) => (status = Number(h[":status"])));
            req.on("data", (chunk) => (body += chunk));
            req.on("end", () => {
              if (status === 200) return resolve("sent");
              const reason = (() => {
                try {
                  return JSON.parse(body).reason as string;
                } catch {
                  return body;
                }
              })();
              if (status === 410 || reason === "BadDeviceToken" || reason === "Unregistered") return resolve("gone");
              console.error("[native-push] apns send failed:", status, reason);
              resolve("failed");
            });
            req.on("error", (err) => {
              console.error("[native-push] apns request:", err);
              resolve("failed");
            });
            req.end(payload);
          }),
      ),
    );
  } finally {
    session.close();
  }
}

// -- FCM --------------------------------------------------------------------

type ServiceAccount = { project_id: string; client_email: string; private_key: string };

function serviceAccount(): ServiceAccount | null {
  try {
    const raw = process.env.FCM_SERVICE_ACCOUNT;
    const parsed = raw ? (JSON.parse(raw) as ServiceAccount) : null;
    return parsed?.project_id && parsed.client_email && parsed.private_key ? parsed : null;
  } catch {
    return null;
  }
}

export function fcmEnabled() {
  return serviceAccount() !== null;
}

let fcmAccess: { token: string; expiresAt: number } | null = null;

async function fcmAccessToken(account: ServiceAccount) {
  if (fcmAccess && Date.now() < fcmAccess.expiresAt - 5 * 60 * 1000) return fcmAccess.token;
  const now = Math.floor(Date.now() / 1000);
  const assertion = signJwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: account.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    },
    createPrivateKey(account.private_key.replace(/\\n/g, "\n")),
    "RS256",
  );
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
  });
  if (!res.ok) throw new Error(`fcm auth failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  fcmAccess = { token: json.access_token, expiresAt: Date.now() + json.expires_in * 1000 };
  return json.access_token;
}

/** Sends to Android registration tokens (FCM HTTP v1 takes one per request). */
export async function sendFcm(tokens: string[], message: NativeMessage): Promise<SendResult[]> {
  const account = serviceAccount();
  if (!account || tokens.length === 0) return tokens.map(() => "failed");
  let access: string;
  try {
    access = await fcmAccessToken(account);
  } catch (err) {
    console.error("[native-push]", err);
    return tokens.map(() => "failed");
  }

  return Promise.all(
    tokens.map(async (token): Promise<SendResult> => {
      try {
        const res = await fetch(`https://fcm.googleapis.com/v1/projects/${account.project_id}/messages:send`, {
          method: "POST",
          headers: { Authorization: `Bearer ${access}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: {
              token,
              notification: { title: message.title, body: message.body },
              data: { url: message.url },
              android: {
                priority: "high",
                ttl: "86400s",
                notification: message.tag ? { tag: message.tag } : {},
              },
            },
          }),
        });
        if (res.ok) return "sent";
        const text = await res.text();
        // UNREGISTERED: the app was uninstalled or the token rotated.
        if (res.status === 404 || text.includes("UNREGISTERED")) return "gone";
        console.error("[native-push] fcm send failed:", res.status, text.slice(0, 300));
        return "failed";
      } catch (err) {
        console.error("[native-push] fcm request:", err);
        return "failed";
      }
    }),
  );
}
