import { createHmac, timingSafeEqual } from "node:crypto";

// A key for sending one delivery's live location: this order, this rider,
// a few hours. The apps send positions from the background through their
// native HTTP connection, which doesn't carry the site's login cookie --
// this proves who's sending instead. Only the server can make one.

const TTL_MS = 6 * 60 * 60_000;
const secret = () => process.env.TRACKING_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";

const sign = (payload: string) => createHmac("sha256", secret()).update(payload).digest("base64url");

export function makeTrackingToken(orderId: string, userId: string): { token: string; expiresAt: string } {
  const exp = Date.now() + TTL_MS;
  const payload = `${orderId}.${userId}.${exp}`;
  return { token: `${userId}.${exp}.${sign(payload)}`, expiresAt: new Date(exp).toISOString() };
}

/** The rider's user id when the key is valid for this order and still fresh, else null. */
export function readTrackingToken(token: string, orderId: string): string | null {
  const [userId, expRaw, mac] = token.split(".");
  const exp = Number(expRaw);
  if (!userId || !mac || !Number.isFinite(exp) || exp < Date.now()) return null;
  const expected = Buffer.from(sign(`${orderId}.${userId}.${exp}`));
  const given = Buffer.from(mac);
  return expected.length === given.length && timingSafeEqual(expected, given) ? userId : null;
}
